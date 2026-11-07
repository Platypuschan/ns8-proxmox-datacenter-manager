#!/bin/bash

#
# Copyright (C) 2026 Platypuschan
# SPDX-License-Identifier: GPL-3.0-or-later
#

# Terminate on error
set -e

# Prepare variables for later use
images=()
# The image will be pushed to GitHub container registry
repobase="${REPOBASE:-ghcr.io/platypuschan}"
# Keep the published image name aligned with module-info.yml, which derives
# "proxmox-datacenter-manager" from the repository name
# "ns8-proxmox-datacenter-manager".
reponame="proxmox-datacenter-manager"
repository_source="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-Platypuschan/ns8-proxmox-datacenter-manager}"
MODULE_VERSION="$(tr -d '\r\n' < CATALOG_VERSION)"
# The application image is built from app/ (Debian plus the packages of the
# official Proxmox repository download.proxmox.com/debian/pdm). Its tag is the
# Git tree hash of app/; in CI the "app" job of publish-images.yml pushes it
# before this script runs.
PDM_IMAGE="$(.github/scripts/app-image)"
# Keep in sync with the Node.js version used by .github/workflows/validate.yml
NODE_IMAGE="docker.io/library/node:24.20.0"
nodebuilder="nodebuilder-pdm-${NODE_IMAGE##*:}"

if [[ -z "${CI:-}" ]] && ! buildah inspect --type image "${PDM_IMAGE}" >/dev/null 2>&1; then
	echo "Building the application image ${PDM_IMAGE}..."
	buildah bud --layers -t "${PDM_IMAGE}" app
fi

# Create a new empty container image
container=$(buildah from scratch)

# Reuse an existing builder container for the same Node.js version, to speed up builds
if ! buildah containers --format "{{.ContainerName}}" | grep -qx "${nodebuilder}"; then
	echo "Pulling NodeJS runtime..."
	buildah from --name "${nodebuilder}" -v "${PWD}:/usr/src:Z" "${NODE_IMAGE}"
fi

echo "Build static UI files with node..."
buildah run \
	--workingdir=/usr/src/ui \
	"${nodebuilder}" \
	sh -c "corepack enable && yarn install --immutable && yarn build"

# Add imageroot directory to the container image
buildah add "${container}" imageroot /imageroot
buildah add "${container}" ui/dist /ui
# One reserved web port, rootless container, Traefik route administration.
# The org.nethserver.images label makes NS8 pull the application image and
# export it to the unit file as ${PDM_APP_IMAGE}.
buildah config --entrypoint=/ \
	--label="org.opencontainers.image.source=${repository_source}" \
	--label="org.opencontainers.image.version=${MODULE_VERSION}" \
	--label="org.opencontainers.image.revision=${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}" \
	--label="org.nethserver.authorizations=traefik@node:routeadm" \
	--label="org.nethserver.tcp-ports-demand=1" \
	--label="org.nethserver.rootfull=0" \
	--label="org.nethserver.min-core=3.22.0" \
	--label="org.nethserver.images=${PDM_IMAGE}" \
	"${container}"
# Commit the image
buildah commit "${container}" "${repobase}/${reponame}"

# Append the image URL to the images array
images+=("${repobase}/${reponame}")

#
# Setup CI when pushing to Github.
# Warning! docker::// protocol expects lowercase letters (,,)
if [[ -n "${CI}" ]]; then
	# Set output value for Github Actions
	printf "images=%s\n" "${images[*],,}" >>"${GITHUB_OUTPUT}"
else
	# Just print info for manual push
	printf "Publish the images with:\n\n"
	for image in "${images[@],,}"; do printf "  buildah push %s docker://%s:%s\n" "${image}" "${image}" "${IMAGETAG:-latest}"; done
	printf "\n"
fi
