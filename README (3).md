# Task Manager (Thiranex Task 3: JavaScript Logic & State Management)

A client-side to-do list built with vanilla HTML, CSS and JavaScript. No libraries, no build step.

## Features
- **Create** tasks with a priority (Low, Medium, High)
- **Read** the list, with item counts and a progress bar
- **Update** a task inline: change its text or priority (Enter saves, Escape cancels), and tick it complete
- **Delete** one task, or clear all completed tasks
- **Filters:** All, Active, Completed (the chosen filter is remembered too)
- **Persistence:** everything is saved with `window.localStorage` and restored on reload
- **Dynamic DOM:** the list is built with `createElement`, so user text is never injected as HTML
- **Delegated event listeners:** one `click`, `change`, `submit` and `keydown` listener on the list covers every task
- Accessible: labels, keyboard use, focus management, live announcements, light/dark theme

## How the state works
A single `state` object (`tasks`, `filter`, `editingId`) is the source of truth.
Every action updates `state`, calls `save()` to write to `localStorage` (key `thiranex.todo.v1`), then `render()` redraws the list.

## Files
`index.html`, `styles.css`, `app.js`, `README.md`

## Run locally
Open `index.html` in a browser.
