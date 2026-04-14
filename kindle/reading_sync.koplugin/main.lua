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
local UPLOAD_URL = "https://reading-sync.vercel.app/api/upload"
local LOG_PATH = "/mnt/us/reading_sync_log.txt"
local CONFIG_PATH = "/mnt/us/.reading_sync_config"

local function loadApiKey()
    local file = io.open(CONFIG_PATH, "r")
    if not file then return nil end
    local key = file:read("*l")
    file:close()
    if key and key ~= "" then return key:match("^%s*(.-)%s*$") end
    return nil
end

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
    local apiKey = loadApiKey()

    local headers = {
        ["Content-Type"] = "application/json",
        ["Content-Length"] = tostring(#body),
    }
    if apiKey then headers["x-api-key"] = apiKey end

    local _, code = http.request{
        url = API_URL,
        method = "POST",
        headers = headers,
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
    local apiKey = loadApiKey()

    local url = API_URL .. "/" .. urlEncode(bookId)
    if source then
        url = url .. "?source=" .. urlEncode(source)
    end
    log("GET " .. url)

    local headers = {}
    if apiKey then headers["x-api-key"] = apiKey end

    local _, code = http.request{
        url = url,
        method = "GET",
        headers = headers,
        sink = ltn12.sink.table(response),
    }

    log("GET response: " .. tostring(code) .. " " .. table.concat(response))

    if code == 200 then
        return JSON.decode(table.concat(response))
    end

    return nil
end

--- Sanitize any string into the canonical bookId format.
--- Contract (shared with backend + Swift client):
---   lowercase, replace [^a-z0-9._-] with "-", collapse runs, trim "-".
local function sanitizeId(s)
    if not s or s == "" then return "unknown" end
    s = s:lower()
    s = s:gsub("[^%w%.%-_]", "-")
    s = s:gsub("%-+", "-")
    s = s:gsub("^%-+", ""):gsub("%-+$", "")
    if s == "" then return "unknown" end
    return s
end

--- Try to read dc:identifier from the document's metadata.
--- KOReader's CreDocument exposes getProps(); the identifier field name varies
--- across versions so we check a few shapes defensively.
local function readDcIdentifier(doc)
    local props
    pcall(function() props = doc:getProps() end)
    if not props then return nil end

    if type(props.identifiers) == "string" and props.identifiers ~= "" then
        -- May be comma-separated; take the first entry.
        local first = props.identifiers:match("^([^,]+)")
        if first then return first end
    end
    if type(props.identifier) == "string" and props.identifier ~= "" then
        return props.identifier
    end
    return nil
end

--- Compute the canonical bookId for a document.
--- Prefers dc:identifier (stable across filenames/devices); falls back to
--- the sanitized filename when identifier is absent.
local function getBookId(doc)
    local identifier = readDcIdentifier(doc)
    if identifier then
        return sanitizeId(identifier)
    end
    local filepath = doc.file or "unknown"
    local filename = filepath:match("([^/]+)$") or filepath
    return sanitizeId(filename)
end

--- Extract the filename (basename) from a filepath, for use as the R2 key.
local function getFileName(filepath)
    return filepath:match("([^/]+)$") or filepath
end

--- Upload EPUB to R2 via presigned URL.
--- Uses ltn12.source.file() for memory-efficient streaming.
--- `bookId` is the canonical id (from getBookId) stored in the DB.
--- `fileName` is the on-disk basename, used only for the R2 object key.
local function uploadEpub(filepath, bookId, bookTitle)
    local http = require("socket.http")
    local ltn12 = require("ltn12")
    local apiKey = loadApiKey()
    local fileName = getFileName(filepath)

    -- Step 1: Get presigned URL
    local reqBody = JSON.encode({ fileName = fileName })
    local presignResponse = {}

    local presignHeaders = {
        ["Content-Type"] = "application/json",
        ["Content-Length"] = tostring(#reqBody),
    }
    if apiKey then presignHeaders["x-api-key"] = apiKey end

    local _, presignCode = http.request{
        url = UPLOAD_URL,
        method = "POST",
        headers = presignHeaders,
        source = ltn12.source.string(reqBody),
        sink = ltn12.sink.table(presignResponse),
    }

    if presignCode ~= 200 then
        log("Upload presign failed: " .. tostring(presignCode))
        return false
    end

    local presignData = JSON.decode(table.concat(presignResponse))
    if not presignData or not presignData.signedUrl then
        log("Upload presign response missing signedUrl")
        return false
    end

    -- Step 2: Stream EPUB directly to R2 via presigned PUT
    local fileHandle = io.open(filepath, "rb")
    if not fileHandle then
        log("Upload: cannot open file " .. filepath)
        return false
    end

    local fileSize = fileHandle:seek("end")
    fileHandle:seek("set", 0)

    log("Upload: streaming " .. tostring(fileSize) .. " bytes to R2")

    local uploadResponse = {}
    local _, uploadCode = http.request{
        url = presignData.signedUrl,
        method = "PUT",
        headers = {
            ["Content-Type"] = "application/epub+zip",
            ["Content-Length"] = tostring(fileSize),
        },
        source = ltn12.source.file(fileHandle),
        sink = ltn12.sink.table(uploadResponse),
    }

    if uploadCode ~= 200 then
        log("Upload PUT failed: " .. tostring(uploadCode))
        return false
    end

    -- Step 3: Confirm upload to backend
    local confirmBody = JSON.encode({
        bookId = bookId,
        bookTitle = bookTitle,
        key = presignData.key,
        safeName = presignData.safeName,
    })
    local confirmResponse = {}

    local confirmHeaders = {
        ["Content-Type"] = "application/json",
        ["Content-Length"] = tostring(#confirmBody),
    }
    if apiKey then confirmHeaders["x-api-key"] = apiKey end

    local _, confirmCode = http.request{
        url = UPLOAD_URL,
        method = "PUT",
        headers = confirmHeaders,
        source = ltn12.source.string(confirmBody),
        sink = ltn12.sink.table(confirmResponse),
    }

    if confirmCode ~= 200 then
        log("Upload confirm failed: " .. tostring(confirmCode))
        return false
    end

    log("Upload complete: " .. fileName)
    return true
end

--- Collect current document state into a sync data payload.
local function buildSyncPayload(self)
    local doc = self.ui.document

    local ok_pos, pos = pcall(function() return doc:getCurrentPos() end)
    local ok_page, current_page = pcall(function() return self.ui:getCurrentPage() end)
    local ok_total, total_pages = pcall(function() return doc:getPageCount() end)
    local ok_xp, xpointer = pcall(function() return doc:getXPointer() end)

    if not ok_pos then pos = "0" end
    if not ok_page then current_page = nil end
    if not ok_total then total_pages = nil end
    if not ok_xp then xpointer = nil end

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
    local book_title
    pcall(function()
        local props = doc:getProps()
        if props and type(props.title) == "string" and props.title ~= "" then
            book_title = props.title
        end
    end)
    if not book_title then
        book_title = filepath:match("([^/]+)%.[^.]+$") or book_id
    end

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

    local cfg = {}
    pcall(function()
        if self.ui.document and self.ui.document.configurable then
            cfg = self.ui.document.configurable
        end
    end)

    if margin_top == 0 and cfg.t_page_margin then margin_top = cfg.t_page_margin end
    if margin_bottom == 0 and cfg.b_page_margin then margin_bottom = cfg.b_page_margin end
    if not line_height and cfg.line_spacing then
        line_height = cfg.line_spacing
    end

    local excerpt = nil
    pcall(function()
        if xpointer then
            local text = doc:getTextFromXPointer(xpointer, 500)
            if text and text ~= "" then excerpt = text end
        end
    end)
    if not excerpt then
        pcall(function()
            if xpointer then
                local text = doc:getTextFromXPointers(xpointer, nil, 500)
                if text and text ~= "" then excerpt = text end
            end
        end)
    end

    return {
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
end

--- Navigate to a remote position using excerpt search with page fallback.
local function navigateToRemote(self, remote)
    local doc = self.ui.document
    local total_pages = doc:getPageCount() or 0
    local navigated = false

    if remote.excerpt and remote.excerpt ~= "" then
        pcall(function()
            local search_text = remote.excerpt:sub(1, 80)
            log("Auto-fetch: searching for excerpt: " .. search_text)
            local xp = doc:findText(search_text, 0, 0, true, false)
            if xp then
                log("Auto-fetch: found excerpt at xpointer")
                doc:gotoXPointer(xp)
                navigated = true
            end
        end)
    end

    if not navigated then
        local target_page = remote.current_page or math.floor(remote.progress * total_pages)
        log("Auto-fetch: excerpt not found, using page " .. tostring(target_page))
        pcall(function()
            self.ui:handleEvent(
                require("ui/event"):new("GotoPage", target_page)
            )
        end)
    end
end

function ReadingSync:init()
    log("INIT called")

    self.last_synced_page = nil
    self._has_fetched_on_open = false

    if self.ui and self.ui.menu then
        self.ui.menu:registerToMainMenu(self)
        log("Registered in menu")
    end
end

function ReadingSync:onReaderReady()
    log("onReaderReady called")
    self._has_fetched_on_open = false
    self:autoFetchOnOpen()
end

--- Auto-fetch remote mobile progress when a book is opened.
--- If a newer mobile position exists, prompt the user.
function ReadingSync:autoFetchOnOpen()
    if self._has_fetched_on_open then return end
    self._has_fetched_on_open = true

    if not self.ui or not self.ui.document then return end

    local doc = self.ui.document
    local book_id = getBookId(doc)
    log("Auto-fetch: checking remote progress for " .. book_id)

    local remote = getProgress(book_id, "mobile")

    if not remote then
        log("Auto-fetch: no mobile progress found")
        return
    end

    if not remote.progress or remote.progress == 0 then
        log("Auto-fetch: mobile progress is 0%, skipping")
        return
    end

    local remote_pct = math.floor(remote.progress * 100)
    local total_pages = doc:getPageCount() or 0
    local remote_page = remote.current_page or math.floor(remote.progress * total_pages)

    local excerpt_preview = ""
    if remote.excerpt and remote.excerpt ~= "" then
        excerpt_preview = "\n\n\"" .. remote.excerpt:sub(1, 80) .. "...\""
    end

    log("Auto-fetch: mobile at " .. remote_pct .. "%, prompting user")

    UIManager:show(ConfirmBox:new{
        text = "Continue from mobile app?\n\nPage " .. tostring(remote_page)
            .. "/" .. tostring(total_pages) .. " (" .. remote_pct .. "%)"
            .. excerpt_preview,
        ok_text = "Yes, sync",
        cancel_text = "No",
        ok_callback = function()
            navigateToRemote(self, remote)
            UIManager:show(InfoMessage:new{
                text = "Synced to mobile position",
                timeout = 2,
            })
        end,
    })
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
    local InputDialog = require("ui/widget/inputdialog")
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
                text = "Sync from mobile app",
                callback = function()
                    self:syncFromMobile()
                end,
            },
            {
                text = "Set API key",
                keep_menu_open = true,
                callback = function()
                    local current = loadApiKey() or ""
                    local dialog
                    dialog = InputDialog:new{
                        title = "ReadingSync API Key",
                        description = "Generate a key in the mobile app under Settings → Kindle API Key, then paste it here.",
                        input = current,
                        input_hint = "rs_...",
                        buttons = {
                            {
                                {
                                    text = "Cancel",
                                    id = "close",
                                    callback = function()
                                        UIManager:close(dialog)
                                    end,
                                },
                                {
                                    text = "Save",
                                    is_enter_default = true,
                                    callback = function()
                                        local key = dialog:getInputText()
                                        local file = io.open(CONFIG_PATH, "w")
                                        if file then
                                            file:write(key)
                                            file:close()
                                            log("API key saved")
                                            UIManager:show(InfoMessage:new{
                                                text = "API key saved!",
                                                timeout = 2,
                                            })
                                        end
                                        UIManager:close(dialog)
                                    end,
                                },
                            },
                        },
                    }
                    UIManager:show(dialog)
                end,
            },
        },
    }
end

function ReadingSync:syncProgressSilent()
    if not self.ui or not self.ui.document then
        return
    end

    local data = buildSyncPayload(self)
    log("render_settings: " .. JSON.encode(data.render_settings))

    local code, response = postProgress(data)

    if code == 200 or code == 409 then
        if code == 409 then
            log("Auto-sync: server has newer position (409), skipping")
        else
            log("Auto-sync OK: page " .. tostring(data.current_page))
        end

        -- Check has_epub and upload if missing
        pcall(function()
            local respData = JSON.decode(response)
            if respData and respData.has_epub == false then
                local filepath = self.ui.document.file
                if filepath then
                    log("Auto-sync: backend has no EPUB, starting upload")
                    UIManager:show(InfoMessage:new{
                        text = "Uploading book to cloud...",
                        timeout = 2,
                    })
                    local ok = uploadEpub(filepath, data.book_id, data.book_title)
                    if ok then
                        log("Auto-sync: EPUB upload succeeded")
                    else
                        log("Auto-sync: EPUB upload failed, will retry next sync")
                    end
                end
            end
        end)
    else
        log("Auto-sync failed: " .. tostring(code))
    end
end

function ReadingSync:syncProgress()
    if not self.ui or not self.ui.document then
        log("No document open")
        return
    end

    local data = buildSyncPayload(self)

    log("Syncing: " .. data.book_id .. " page " .. tostring(data.current_page) .. "/" .. tostring(data.total_pages))
    log("render_settings: " .. JSON.encode(data.render_settings))

    local code, response = postProgress(data)

    if code == 200 then
        log("Sync OK: " .. response)
        UIManager:show(InfoMessage:new{
            text = "Progress synced! (" .. math.floor(data.progress * 100) .. "%)",
            timeout = 2,
        })

        -- Check has_epub and upload if missing
        pcall(function()
            local respData = JSON.decode(response)
            if respData and respData.has_epub == false then
                local filepath = self.ui.document.file
                if filepath then
                    log("Manual sync: backend has no EPUB, starting upload")
                    UIManager:show(InfoMessage:new{
                        text = "Uploading book to cloud...",
                        timeout = 2,
                    })
                    local ok = uploadEpub(filepath, data.book_id, data.book_title)
                    if ok then
                        UIManager:show(InfoMessage:new{
                            text = "Book uploaded to cloud!",
                            timeout = 2,
                        })
                    else
                        UIManager:show(InfoMessage:new{
                            text = "Book upload failed (will retry)",
                            timeout = 3,
                        })
                    end
                end
            end
        end)
    elseif code == 409 then
        log("Sync: server has newer position (409)")
        UIManager:show(InfoMessage:new{
            text = "Progress synced! (server had newer position)",
            timeout = 2,
        })
    else
        log("Sync failed: " .. tostring(code) .. " " .. tostring(response))
        UIManager:show(InfoMessage:new{
            text = "Sync failed: " .. tostring(code),
            timeout = 3,
        })
    end
end

function ReadingSync:syncFromMobile()
    if not self.ui or not self.ui.document then
        log("No document open")
        return
    end

    local doc = self.ui.document
    local book_id = getBookId(doc)
    log("Sync from mobile: fetching for " .. book_id)

    local remote = getProgress(book_id, "mobile")

    if not remote then
        UIManager:show(InfoMessage:new{
            text = "No mobile app progress found for this book",
            timeout = 3,
        })
        return
    end

    if not remote.progress or remote.progress == 0 then
        UIManager:show(InfoMessage:new{
            text = "Mobile app progress is 0% — cannot sync",
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
        text = "In the mobile app you stopped at page " .. tostring(remote_page)
            .. "/" .. tostring(total_pages) .. " (" .. remote_pct .. "%)."
            .. excerpt_preview .. "\n\n"
            .. "Do you want to sync to that position?",
        ok_text = "Yes, sync",
        cancel_text = "No",
        ok_callback = function()
            navigateToRemote(self, remote)
            UIManager:show(InfoMessage:new{
                text = "Synced to mobile app position",
                timeout = 2,
            })
        end,
    })
end

return ReadingSync
