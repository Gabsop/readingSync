local WidgetContainer = require("ui/widget/container/widgetcontainer")
local JSON = require("json")
local UIManager = require("ui/uimanager")
local InfoMessage = require("ui/widget/infomessage")
local ConfirmBox = require("ui/widget/confirmbox")

local ReadingSync = WidgetContainer:extend{
    name = "reading_sync",
    is_doc_only = false,
}

local API_URL = "https://reading-sync.vercel.app/api/progress"
local LOG_PATH = "/mnt/us/reading_sync_log.txt"

local function log(msg)
    local file = io.open(LOG_PATH, "a")
    if file then
        file:write(os.date("%H:%M:%S") .. " - " .. msg .. "\n")
        file:close()
    end
end

local function postProgress(data)
    local http = require("socket.http")
    local ltn12 = require("ltn12")
    local body = JSON.encode(data)
    local response = {}

    local _, code = http.request{
        url = API_URL,
        method = "POST",
        headers = {
            ["Content-Type"] = "application/json",
            ["Content-Length"] = tostring(#body),
        },
        source = ltn12.source.string(body),
        sink = ltn12.sink.table(response),
    }

    return code, table.concat(response)
end

local function urlEncode(str)
    return str:gsub("([^%w%-%.%_%~])", function(c)
        return string.format("%%%02X", string.byte(c))
    end)
end

local function getProgress(bookId, source)
    local http = require("socket.http")
    local ltn12 = require("ltn12")
    local response = {}

    local url = API_URL .. "/" .. urlEncode(bookId)
    if source then
        url = url .. "?source=" .. urlEncode(source)
    end
    log("GET " .. url)

    local _, code = http.request{
        url = url,
        method = "GET",
        sink = ltn12.sink.table(response),
    }

    log("GET response: " .. tostring(code) .. " " .. table.concat(response))

    if code == 200 then
        return JSON.decode(table.concat(response))
    end

    return nil
end

local function getBookId(doc)
    local filepath = doc.file or "unknown"
    return filepath:match("([^/]+)$") or filepath
end

function ReadingSync:init()
    log("INIT called")

    self.last_synced_page = nil

    if self.ui and self.ui.menu then
        self.ui.menu:registerToMainMenu(self)
        log("Registered in menu")
    end
end

function ReadingSync:onPageUpdate(pageno)
    if pageno == self.last_synced_page then
        return
    end

    if self._sync_scheduled then
        UIManager:unschedule(self._sync_scheduled)
    end

    self._sync_scheduled = function()
        self.last_synced_page = pageno
        self:syncProgressSilent()
        self._sync_scheduled = nil
    end

    UIManager:scheduleIn(3, self._sync_scheduled)
end

function ReadingSync:addToMainMenu(menu_items)
    menu_items.reading_sync = {
        text = "Reading Sync",
        sub_item_table = {
            {
                text = "Sync progress now",
                callback = function()
                    self:syncProgress()
                end,
            },
            {
                text = "Sync from web reader",
                callback = function()
                    self:syncFromWeb()
                end,
            },
        },
    }
end

function ReadingSync:syncProgressSilent()
    if not self.ui or not self.ui.document then
        return
    end

    local doc = self.ui.document

    local ok_pos, pos = pcall(function() return doc:getCurrentPos() end)
    local ok_page, current_page = pcall(function() return self.ui:getCurrentPage() end)
    local ok_total, total_pages = pcall(function() return doc:getPageCount() end)
    local ok_xp, xpointer = pcall(function() return doc:getXPointer() end)

    if not ok_pos then pos = "0" end
    if not ok_page then current_page = nil end
    if not ok_total then total_pages = nil end
    if not ok_xp then xpointer = nil end

    -- Use document-level progress for accurate cross-device sync
    local percent = 0
    local ok_progress, doc_progress = pcall(function()
        local cur = doc:getCurrentPos()
        local full = doc:getFullHeight()
        if full and full > 0 then return cur / full end
        return nil
    end)
    if ok_progress and doc_progress then
        percent = doc_progress
    elseif current_page and total_pages and total_pages > 0 then
        percent = current_page / total_pages
    end

    local book_id = getBookId(doc)
    local filepath = doc.file or "unknown"
    local book_title = filepath:match("([^/]+)%.[^.]+$") or book_id

    -- Capture rendering settings for web reader matching
    local ok_font, font_size = pcall(function() return doc:getFontSize() end)
    local ok_margin, margins = pcall(function() return doc:getPageMargins() end)
    local ok_lh, line_height = pcall(function() return doc:getInterlineSpacing() end)
    if not ok_lh or not line_height then
        ok_lh, line_height = pcall(function() return doc:getIntProperty("crengine.interline.space") end)
    end
    local screen_w, screen_h = 0, 0
    pcall(function()
        local Screen = require("device").screen
        screen_w = Screen:getWidth()
        screen_h = Screen:getHeight()
    end)

    if not ok_font then font_size = nil end
    if not ok_lh then line_height = nil end

    local margin_top, margin_bottom, margin_left, margin_right = 0, 0, 0, 0
    if ok_margin and margins then
        margin_top = margins[1] or 0
        margin_bottom = margins[2] or 0
        margin_left = margins[3] or 0
        margin_right = margins[4] or 0
    end

    -- Try to get font face name via multiple approaches
    local font_face = "unknown"
    -- 1) KOReader's ReaderFont stores the font face in self.ui.font
    pcall(function()
        if self.ui.font and self.ui.font.font_face then
            font_face = self.ui.font.font_face
        end
    end)
    -- 2) Try CREngine document property
    if font_face == "unknown" then
        pcall(function()
            local f = doc:getStringProperty("font.face.default")
            if f and f ~= "" then font_face = f end
        end)
    end
    -- 3) Try reading the setting from G_reader_settings
    if font_face == "unknown" then
        pcall(function()
            local G = require("luasettings"):open(
                require("datastorage"):getSettingsDir() .. "/settings.reader.lua"
            )
            local f = G:readSetting("copt_font_face")
            if f then font_face = f end
        end)
    end
    -- 4) Try G_reader_settings global
    if font_face == "unknown" then
        pcall(function()
            local f = G_reader_settings:readSetting("copt_font_face")
            if f then font_face = f end
        end)
    end

    log("font_face detection: " .. tostring(font_face))

    -- Read configurable values (the actual source of truth)
    local cfg = {}
    pcall(function()
        if self.ui.document and self.ui.document.configurable then
            cfg = self.ui.document.configurable
        end
    end)

    -- Use configurable margins as fallback when getPageMargins returns 0
    if margin_top == 0 and cfg.t_page_margin then margin_top = cfg.t_page_margin end
    if margin_bottom == 0 and cfg.b_page_margin then margin_bottom = cfg.b_page_margin end

    -- line_height from configurable (percentage, e.g. 100 = 1.0)
    if not line_height and cfg.line_spacing then
        line_height = cfg.line_spacing
    end

    -- Capture text excerpt at current position for cross-device sync
    local excerpt = nil
    pcall(function()
        if xpointer then
            local text = doc:getTextFromXPointer(xpointer, 150)
            if text and text ~= "" then excerpt = text end
        end
    end)
    if not excerpt then
        pcall(function()
            if xpointer then
                local text = doc:getTextFromXPointers(xpointer, nil, 150)
                if text and text ~= "" then excerpt = text end
            end
        end)
    end
    log("excerpt: " .. tostring(excerpt))

    local data = {
        book_id = book_id,
        book_title = book_title,
        position = xpointer or tostring(pos),
        current_page = current_page,
        total_pages = total_pages,
        progress = percent,
        updated_at = os.time(),
        source = "kindle",
        excerpt = excerpt,
        render_settings = {
            font_size = font_size,
            line_height = line_height,
            screen_width = screen_w,
            screen_height = screen_h,
            margin_top = margin_top,
            margin_bottom = margin_bottom,
            margin_left = margin_left,
            margin_right = margin_right,
            font_face = font_face,
            font_base_weight = cfg.font_base_weight,
            font_gamma = cfg.font_gamma,
            font_hinting = cfg.font_hinting,
            font_kerning = cfg.font_kerning,
            word_expansion = cfg.word_expansion,
            embedded_fonts = cfg.embedded_fonts,
            embedded_css = cfg.embedded_css,
            render_dpi = cfg.render_dpi,
        },
    }

    log("render_settings: " .. JSON.encode(data.render_settings))

    local code = postProgress(data)
    if code == 200 then
        log("Auto-sync OK: page " .. tostring(current_page))
    else
        log("Auto-sync failed: " .. tostring(code))
    end
end

function ReadingSync:syncProgress()
    if not self.ui or not self.ui.document then
        log("No document open")
        return
    end

    local doc = self.ui.document

    local ok_pos, pos = pcall(function() return doc:getCurrentPos() end)
    local ok_page, current_page = pcall(function() return self.ui:getCurrentPage() end)
    local ok_total, total_pages = pcall(function() return doc:getPageCount() end)
    local ok_xp, xpointer = pcall(function() return doc:getXPointer() end)

    if not ok_pos then pos = "0" end
    if not ok_page then current_page = nil end
    if not ok_total then total_pages = nil end
    if not ok_xp then xpointer = nil end

    -- Use document-level progress for accurate cross-device sync
    local percent = 0
    local ok_progress, doc_progress = pcall(function()
        local cur = doc:getCurrentPos()
        local full = doc:getFullHeight()
        if full and full > 0 then return cur / full end
        return nil
    end)
    if ok_progress and doc_progress then
        percent = doc_progress
    elseif current_page and total_pages and total_pages > 0 then
        percent = current_page / total_pages
    end

    local book_id = getBookId(doc)
    local filepath = doc.file or "unknown"
    local book_title = filepath:match("([^/]+)%.[^.]+$") or book_id

    -- Capture rendering settings for web reader matching
    local ok_font, font_size = pcall(function() return doc:getFontSize() end)
    local ok_margin, margins = pcall(function() return doc:getPageMargins() end)
    local ok_lh, line_height = pcall(function() return doc:getInterlineSpacing() end)
    if not ok_lh or not line_height then
        ok_lh, line_height = pcall(function() return doc:getIntProperty("crengine.interline.space") end)
    end
    local screen_w, screen_h = 0, 0
    pcall(function()
        local Screen = require("device").screen
        screen_w = Screen:getWidth()
        screen_h = Screen:getHeight()
    end)

    if not ok_font then font_size = nil end
    if not ok_lh then line_height = nil end

    local margin_top, margin_bottom, margin_left, margin_right = 0, 0, 0, 0
    if ok_margin and margins then
        margin_top = margins[1] or 0
        margin_bottom = margins[2] or 0
        margin_left = margins[3] or 0
        margin_right = margins[4] or 0
    end

    -- Try to get font face name via multiple approaches
    local font_face = "unknown"
    pcall(function()
        if self.ui.font and self.ui.font.font_face then
            font_face = self.ui.font.font_face
        end
    end)
    if font_face == "unknown" then
        pcall(function()
            local f = doc:getStringProperty("font.face.default")
            if f and f ~= "" then font_face = f end
        end)
    end
    if font_face == "unknown" then
        pcall(function()
            local f = G_reader_settings:readSetting("copt_font_face")
            if f then font_face = f end
        end)
    end

    log("font_face detection: " .. tostring(font_face))

    -- Read configurable values (the actual source of truth)
    local cfg = {}
    pcall(function()
        if self.ui.document and self.ui.document.configurable then
            cfg = self.ui.document.configurable
        end
    end)

    -- Use configurable margins as fallback when getPageMargins returns 0
    if margin_top == 0 and cfg.t_page_margin then margin_top = cfg.t_page_margin end
    if margin_bottom == 0 and cfg.b_page_margin then margin_bottom = cfg.b_page_margin end

    -- line_height from configurable (percentage, e.g. 100 = 1.0)
    if not line_height and cfg.line_spacing then
        line_height = cfg.line_spacing
    end

    -- Capture text excerpt at current position for cross-device sync
    local excerpt = nil
    pcall(function()
        if xpointer then
            local text = doc:getTextFromXPointer(xpointer, 150)
            if text and text ~= "" then excerpt = text end
        end
    end)
    if not excerpt then
        pcall(function()
            if xpointer then
                local text = doc:getTextFromXPointers(xpointer, nil, 150)
                if text and text ~= "" then excerpt = text end
            end
        end)
    end
    log("excerpt: " .. tostring(excerpt))

    local data = {
        book_id = book_id,
        book_title = book_title,
        position = xpointer or tostring(pos),
        current_page = current_page,
        total_pages = total_pages,
        progress = percent,
        updated_at = os.time(),
        source = "kindle",
        excerpt = excerpt,
        render_settings = {
            font_size = font_size,
            line_height = line_height,
            screen_width = screen_w,
            screen_height = screen_h,
            margin_top = margin_top,
            margin_bottom = margin_bottom,
            margin_left = margin_left,
            margin_right = margin_right,
            font_face = font_face,
            font_base_weight = cfg.font_base_weight,
            font_gamma = cfg.font_gamma,
            font_hinting = cfg.font_hinting,
            font_kerning = cfg.font_kerning,
            word_expansion = cfg.word_expansion,
            embedded_fonts = cfg.embedded_fonts,
            embedded_css = cfg.embedded_css,
            render_dpi = cfg.render_dpi,
        },
    }

    log("Syncing: " .. book_id .. " page " .. tostring(current_page) .. "/" .. tostring(total_pages))
    log("render_settings: " .. JSON.encode(data.render_settings))

    local code, response = postProgress(data)

    if code == 200 then
        log("Sync OK: " .. response)
        UIManager:show(InfoMessage:new{
            text = "Progress synced! (" .. math.floor(percent * 100) .. "%)",
            timeout = 2,
        })
    else
        log("Sync failed: " .. tostring(code) .. " " .. response)
        UIManager:show(InfoMessage:new{
            text = "Sync failed: " .. tostring(code),
            timeout = 3,
        })
    end
end

function ReadingSync:syncFromWeb()
    if not self.ui or not self.ui.document then
        log("No document open")
        return
    end

    local doc = self.ui.document
    local book_id = getBookId(doc)
    log("Sync from web: fetching for " .. book_id)

    local remote = getProgress(book_id, "web")

    if not remote then
        UIManager:show(InfoMessage:new{
            text = "No web reader progress found for this book",
            timeout = 3,
        })
        return
    end

    if not remote.progress or remote.progress == 0 then
        UIManager:show(InfoMessage:new{
            text = "Web reader progress is 0% — cannot sync",
            timeout = 3,
        })
        return
    end

    local total_pages = doc:getPageCount() or 0
    local remote_page = remote.current_page or math.floor(remote.progress * total_pages)
    local remote_pct = math.floor(remote.progress * 100)

    local excerpt_preview = ""
    if remote.excerpt and remote.excerpt ~= "" then
        excerpt_preview = "\n\n\"" .. remote.excerpt:sub(1, 80) .. "...\""
    end

    UIManager:show(ConfirmBox:new{
        text = "In the web reader you stopped at page " .. tostring(remote_page)
            .. "/" .. tostring(total_pages) .. " (" .. remote_pct .. "%)."
            .. excerpt_preview .. "\n\n"
            .. "Do you want to sync to that position?",
        ok_text = "Yes, sync",
        cancel_text = "No",
        ok_callback = function()
            -- Try to find the excerpt in the book for exact positioning
            local navigated = false
            if remote.excerpt and remote.excerpt ~= "" then
                pcall(function()
                    -- Search for the excerpt text in the document
                    local search_text = remote.excerpt:sub(1, 80)
                    log("Sync from web: searching for excerpt: " .. search_text)

                    -- Use KOReader's text search to find the position
                    local xp = doc:findText(search_text, 0, 0, true, false)
                    if xp then
                        log("Sync from web: found excerpt at xpointer")
                        doc:gotoXPointer(xp)
                        navigated = true
                    end
                end)
            end

            if not navigated then
                -- Fallback to page-based navigation
                local target_page = remote.current_page or math.floor(remote.progress * total_pages)
                log("Sync from web: excerpt not found, using page " .. tostring(target_page))
                pcall(function()
                    self.ui:handleEvent(
                        require("ui/event"):new("GotoPage", target_page)
                    )
                end)
            end

            UIManager:show(InfoMessage:new{
                text = "Synced to web reader position",
                timeout = 2,
            })
        end,
    })
end

return ReadingSync
