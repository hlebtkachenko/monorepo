#!/bin/sh
# Rewrite hardcoded openstatus.dev Resend `from:` addresses to our
# verified afframe.com domain in Next.js compiled chunks, and pin the
# status-page slug-based URL templates to our public host. Runs once
# at container start before the real entrypoint exec's the Node server.
#
# WHY: OpenStatus self-host hardcodes `notifications@notifications.openstatus.dev`
# (and a few `thibault@*` sender addresses); Resend rejects them because we
# don't own that domain. The clean upstream fix is a source patch + image
# rebuild; this in-place sed is the no-rebuild operational workaround.
#
# Applies to status-page + dashboard (Next.js standalone). The Bun-binary
# images (server, workflows) are not patchable in-place — documented in
# STATUS-PAGE.md.

set -e

# Scope find to /app/apps — the only path where the build-baked chunks live.
# Status-page chunks are in /app/apps/status-page/.next/server/chunks/ + the
# Next.js standalone entry at /app/apps/status-page/server.js; dashboard has
# the same shape under /app/apps/dashboard/. Original /app scan walked
# ~50k files in /app/node_modules and took multiple minutes per cold start,
# long enough for the openstatus WSL distro idle-stop to kill the container
# before Next.js could exec — the page stayed 502 indefinitely. /app/apps
# is ~300 files and finishes in seconds.
find /app/apps -type f \( -name '*.js' -o -name '*.cjs' -o -name '*.mjs' \) \
  -exec grep -l 'openstatus\.dev' {} + 2>/dev/null \
  | xargs -r sed -i \
    -e 's/notifications@notifications\.openstatus\.dev/notifications@afframe.com/g' \
    -e 's/welcome@openstatus\.dev/welcome@afframe.com/g' \
    -e 's/thibault@notifications\.openstatus\.dev/notifications@afframe.com/g' \
    -e 's/thibault@openstatus\.dev/notifications@afframe.com/g' \
    -e 's|\${t\.page\.slug}\.openstatus\.dev/verify/|status.afframe.com/verify/|g' \
    -e 's|\${t\.page\.slug}\.openstatus\.dev/unsubscribe/|status.afframe.com/unsubscribe/|g' \
    -e 's|\${t\.page\.slug}\.openstatus\.dev/manage/|status.afframe.com/manage/|g' \
    -e 's|\${pageSlug}\.openstatus\.dev|status.afframe.com|g' \
    -e 's|\${req\.pageSlug}\.openstatus\.dev|status.afframe.com|g' \
  || true

exec "$@"
