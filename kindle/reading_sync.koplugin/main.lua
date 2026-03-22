local WidgetContainer = require("ui/widget/container/widgetcontainer")
local JSON = require("json")

local ReadingSync = WidgetContainer:extend{
    name = "reading_sync",
    is_doc_only = false,
}

local LOG_PATH = "/mnt/us/reading_sync_log.txt"
local SAVE_PATH = "/mnt/us/reading_sync.json"

local function log(msg)
    local file = io.open(LOG_PATH, "a")
    if file then
        file:write(os.date("%H:%M:%S") .. " - " .. msg .. "\n")
        file:close()
    end
end

function ReadingSync:init()
    log("INIT called")

    if self.ui and self.ui.menu then
        self.ui.menu:registerToMainMenu(self)
        log("Registered in menu")
    end
end

function ReadingSync:addToMainMenu(menu_items)
    menu_items.reading_sync = {
        text = "Reading Sync Test",
        callback = function()
            log("MENU CLICKED")

            if not self.ui or not self.ui.document then
                log("No document open")
                return
            end

            local doc = self.ui.document

            local ok_pos, pos = pcall(function() return doc:getCurrentPos() end)
            local ok_prog, percent = pcall(function() return doc:getProgress() end)

            if not ok_pos then pos = "error" end
            if not ok_prog then percent = 0 end

            local data = {
                book = doc.file or "unknown",
                position = pos,
                progress = percent,
                updated_at = os.time()
            }

            local file = io.open(SAVE_PATH, "w")
            if file then
                file:write(JSON.encode(data))
                file:close()
                log("Progress saved!")
            else
                log("Failed to write JSON")
            end
        end
    }
end

return ReadingSync