# KOReader Reading Sync Project

## Overview

This project aims to create a personal reading synchronization system between a Kindle (running KOReader) and external devices (such as a mobile or web app).

The system tracks reading progress in EPUB books and synchronizes it through a custom API, allowing seamless continuation of reading across devices.

---

## Goal

Build a cross-device reading experience that:

- Tracks reading progress on KOReader
- Syncs progress to a backend API
- Allows other clients (mobile/web) to fetch and resume reading
- Supports bidirectional sync (Kindle ↔ app)

---

## Architecture

### 1. KOReader Plugin (Client A)

Located at `reading_sync.koplugin/` in this repo. This plugin runs on the Kindle.

**Current state:**

- Adds a "Reading Sync Test" menu item in KOReader
- On button press, captures current reading position and progress
- Saves data to a local JSON file (`/mnt/us/reading_sync.json`)
- Logs activity to `/mnt/us/reading_sync_log.txt`
- Does **not** yet sync to an API — only local file persistence

**Files:**

- `_meta.lua` — plugin metadata
- `main.lua` — plugin logic (menu registration, progress capture, local save)

**Planned improvements:**

- Send progress to the backend API via HTTP (`POST /progress`)
- Fetch remote progress on book open and prompt to resume
- Automatic sync on page change (not just manual button press)

**Data captured:**

- `book`: file path of the book (e.g. `/mnt/us/...`)
- `position`: internal position from `doc:getCurrentPos()`
- `progress`: percentage from `doc:getProgress()`
- `updated_at`: Unix timestamp

---

### 2. Backend API

The API acts as the central synchronization layer.

Responsibilities:

- Store reading progress per book
- Resolve conflicts (latest timestamp wins)
- Serve progress to clients

---

### 3. Mobile/Web App (Client B)

Responsibilities:

- Fetch reading progress from API
- Render EPUB using a reader (e.g., epub.js)
- Resume reading from saved position
- Send updated progress back to API

---

## Data Model

Example payload:

```json
{
  "book_id": "unique-book-id",
  "position": "epubcfi(/6/2[chapter1]!/4/1:0)",
  "progress": 0.42,
  "updated_at": 1710000000
}
```

### Fields

- `book_id`: unique identifier for the book (hash recommended)
- `position`: precise reading location (CFI preferred)
- `progress`: percentage (0–1)
- `updated_at`: Unix timestamp

---

## API Design

### Base URL

```
https://your-api.com
```

---

### 1. Save Progress

**POST** `/progress`

Stores or updates reading progress.

#### Request Body

```json
{
  "book_id": "string",
  "position": "string",
  "progress": 0.42,
  "updated_at": 1710000000
}
```

#### Response

```json
{
  "status": "ok"
}
```

---

### 2. Get Progress

**GET** `/progress/:book_id`

Fetch the latest reading progress for a book.

#### Response

```json
{
  "book_id": "string",
  "position": "string",
  "progress": 0.42,
  "updated_at": 1710000000
}
```

---

### 3. (Optional) List All Progress

**GET** `/progress`

Returns all tracked books.

```json
[
  {
    "book_id": "book-1",
    "progress": 0.5
  },
  {
    "book_id": "book-2",
    "progress": 0.2
  }
]
```

---

## Conflict Resolution Strategy

When multiple devices update progress:

- Compare `updated_at`
- The most recent update wins

---

## Sync Flow

### KOReader → API

1. User changes page
2. Plugin captures position
3. Plugin sends POST `/progress`

---

### App → API

1. App fetches GET `/progress/:book_id`
2. App loads book at saved position
3. User reads
4. App sends updated progress

---

### API → KOReader

On book open:

1. Plugin requests `/progress/:book_id`
2. Compares timestamps
3. Optionally prompts user to resume from latest position

---

## Future Improvements

- Authentication (user accounts)
- Multi-device support per user
- Highlight and notes sync
- Offline queue + retry
- Web dashboard with reading stats

---

## Conclusion

This system replicates a simplified version of cross-device reading sync (similar to Kindle Whispersync), fully controlled and customizable.

It provides a solid foundation for expanding into a complete reading ecosystem.
