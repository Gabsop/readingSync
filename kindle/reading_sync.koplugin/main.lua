local WidgetContainer = require("ui/widget/container/widgetcontainer")
local JSON = require("json")
local UIManager = require("ui/uimanager")
local InfoMessage = require("ui/widget/infomessage")

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

local function getProgress(bookId)
    local http = require("socket.http")
    local ltn12 = require("ltn12")
    local response = {}

    local _, code = http.request{
        url = API_URL .. "/" .. bookId,
        method = "GET",
        sink = ltn12.sink.table(response),
    }

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
                text = "Fetch remote progress",
                callback = function()
                    self:fetchRemoteProgress()
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

    local data = {
        book_id = book_id,
        book_title = book_title,
        position = xpointer or tostring(pos),
        current_page = current_page,
        total_pages = total_pages,
        progress = percent,
        updated_at = os.time(),
        render_settings = {
            font_size = font_size,
            line_height = line_height,
            screen_width = screen_w,
            screen_height = screen_h,
            margin_top = margin_top,
            margin_bottom = margin_bottom,
            margin_left = margin_left,
            margin_right = margin_right,
        },
    }

    log("render_settings: font=" .. tostring(font_size)
        .. " lh=" .. tostring(line_height)
        .. " screen=" .. tostring(screen_w) .. "x" .. tostring(screen_h)
        .. " margins=" .. tostring(margin_top) .. "/" .. tostring(margin_bottom)
        .. "/" .. tostring(margin_left) .. "/" .. tostring(margin_right))

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

    local data = {
        book_id = book_id,
        book_title = book_title,
        position = xpointer or tostring(pos),
        current_page = current_page,
        total_pages = total_pages,
        progress = percent,
        updated_at = os.time(),
        render_settings = {
            font_size = font_size,
            line_height = line_height,
            screen_width = screen_w,
            screen_height = screen_h,
            margin_top = margin_top,
            margin_bottom = margin_bottom,
            margin_left = margin_left,
            margin_right = margin_right,
        },
    }

    log("Syncing: " .. book_id .. " page " .. tostring(current_page) .. "/" .. tostring(total_pages))
    log("render_settings: font=" .. tostring(font_size)
        .. " lh=" .. tostring(line_height)
        .. " screen=" .. tostring(screen_w) .. "x" .. tostring(screen_h)
        .. " margins=" .. tostring(margin_top) .. "/" .. tostring(margin_bottom)
        .. "/" .. tostring(margin_left) .. "/" .. tostring(margin_right))

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

function ReadingSync:fetchRemoteProgress()
    if not self.ui or not self.ui.document then
        log("No document open")
        return
    end

    local book_id = getBookId(self.ui.document)
    log("Fetching remote progress for: " .. book_id)

    local remote = getProgress(book_id)

    if remote then
        local msg = "Remote: " .. math.floor(remote.progress * 100) .. "%"
        if remote.current_page and remote.total_pages then
            msg = msg .. " (page " .. remote.current_page .. "/" .. remote.total_pages .. ")"
        end
        UIManager:show(InfoMessage:new{
            text = msg,
            timeout = 4,
        })
        log("Remote progress: " .. msg)
    else
        UIManager:show(InfoMessage:new{
            text = "No remote progress found",
            timeout = 3,
        })
        log("No remote progress found for: " .. book_id)
    end
end

return ReadingSync
