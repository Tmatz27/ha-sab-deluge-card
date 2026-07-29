# Changelog

## 0.1.3

- Say how many torrents were filtered out when the Deluge section is empty, so
  "everything finished" is no longer indistinguishable from "no data loaded"
- Base the Deluge global pause button on every torrent the daemon reports
  rather than only the visible ones. It previously offered Pause on an
  already-paused Deluge whenever the incomplete queue was empty
- Shrink the total speed panel: smaller title, pills, icons, and padding

## 0.1.2

- Stop reporting every HTTP 503 as "SABnzbd or Deluge is not configured". Arr
  Stack Integration also returns 503 when Home Assistant cannot open a
  connection, so the card now distinguishes an unreachable client from a
  missing configuration and says which one it is
- Name the failing client in the error banner and show the message the
  integration actually returned, instead of a fixed guess
- Report a failure per request, so one client being down no longer hides the
  other client's data or masks a second error
- Detect a Deluge password failure. Arr Stack Integration does not check
  Deluge's `auth.login` result, so bad credentials return an empty torrent list
  with HTTP 200; the card now flags that instead of showing an idle queue
- Log the underlying error to the browser console for every failed request
- Stop rendering `[object Object]` when an error carries no readable message

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
