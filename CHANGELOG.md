# Changelog

## 0.1.1

- Register the card with the dashboard picker before defining its custom
  elements, so a registration failure can no longer stop **SAB & Deluge Card**
  from appearing under **Add card**
- Report element-registration failures to the browser console instead of
  failing silently
- Add a documentation link to the card picker entry
- Request client logos with `referrerpolicy="no-referrer"` so the Home
  Assistant origin is not sent to the CDN
- Document how to diagnose a card that does not appear in the picker

## 0.1.0

- Initial HACS-ready release
- Combined SABnzbd and Deluge speed panel
- Live SABnzbd queue without history requests
- Incomplete-only Deluge queue filtering
- Global pause and resume for both clients
- Per-item Deluge pause, resume, keep-files removal, and delete-files removal
- Current-queue removal for SABnzbd
- Pagination, Deluge sorting, mobile layout, and visual editor
- Deluge and SABnzbd payloads verified against Arr Stack Integration 1.6.38
- Polling resumes after Home Assistant re-attaches the card on a view switch
- Visual editor no longer rebuilds itself when Home Assistant echoes a config
  change back, so open dropdowns and focused inputs survive an edit
- Refresh ticks that produce identical markup leave the DOM untouched, and the
  stylesheet is mounted once instead of rebuilt on every refresh
- SABnzbd pause state reads the queue's `paused` flag rather than the display
  string, which reads "Idle" for a paused empty queue
- Client logos use the maintained `homarr-labs/dashboard-icons` repository and
  fall back to Material Design icons if the CDN is unreachable
- Pending removal confirmations are dropped if the queue item disappears first
