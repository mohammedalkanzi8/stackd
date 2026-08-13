# The image that rebuilds and uploads the public website.
#
# Separate from deploy/Dockerfile because it does a different job: that one
# produces a long-running Next server for the two portals, this one runs a
# one-shot pipeline — regenerate the menu from the database, build the static
# export, upload it to Cloudflare Pages — and exits.
#
# ⚠ DEPENDENCIES ARE INSTALLED AT IMAGE BUILD, NOT AT RUN. A publish happens
# whenever a price is edited, and `npm ci` on a two-core box is minutes on its
# own. Baking them in means a publish is only the work that actually has to
# happen each time.

FROM node:22-alpine

# wrangler shells out to nothing, but the Next build wants a real /bin/sh and
# git metadata is absent in this context, so keep it minimal and explicit.
WORKDIR /repo

# Manifests first: this layer is rebuilt only when a dependency actually
# changes, not on every menu edit.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/portal/package.json apps/portal/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json

# The workspace root install covers apps/web and the two packages it imports.
RUN npm ci --no-audit --no-fund

# wrangler is invoked through npx at publish time; pinning it here keeps a
# publish offline-fast and stops a surprise major version arriving mid-service.
RUN npm i -g wrangler@4

# The repo itself is bind-mounted at run time, so the source is always whatever
# is checked out on the VM — including photographs uploaded through the admin
# portal, which land in apps/web/public/menu on the host.
COPY deploy/publish.sh /usr/local/bin/publish
RUN chmod +x /usr/local/bin/publish

CMD ["publish"]
