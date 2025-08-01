#! /bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# -- Available env vars --
# * DOCKER_HUB_REPO - which Docker Hub repo to use
# * DOCKER_HUB_TAG  - which Docker Hub tag to create
# * CORE_BRANCH  - which branch to build in core
# * COLLABORA_ONLINE_REPO - which git repo to clone online from
# * COLLABORA_ONLINE_BRANCH - which branch to build in online
# * CORE_BUILD_TARGET - which make target to run (in core repo)
# * ONLINE_EXTRA_BUILD_OPTIONS - extra build options for online
# * NO_DOCKER_IMAGE - if set, don't build the docker image itself, just do all the preps

# Check env variables
if [ -z "$DOCKER_HUB_REPO" ]; then
  DOCKER_HUB_REPO="mydomain/collaboraonline"
fi;
if [ -z "$DOCKER_HUB_TAG" ]; then
  DOCKER_HUB_TAG="latest"
fi;
echo "Using Docker Hub Repository: '$DOCKER_HUB_REPO' with tag '$DOCKER_HUB_TAG'."

if [ -z "$CORE_BRANCH" ]; then
  CORE_BRANCH="distro/collabora/co-25.04"
fi;
echo "Building core branch '$CORE_BRANCH'"

if [ -z "$COLLABORA_ONLINE_REPO" ]; then
  COLLABORA_ONLINE_REPO="https://github.com/CollaboraOnline/online.git"
fi;
if [ -z "$COLLABORA_ONLINE_BRANCH" ]; then
  COLLABORA_ONLINE_BRANCH="master"
fi;
echo "Building online branch '$COLLABORA_ONLINE_BRANCH' from '$COLLABORA_ONLINE_REPO'"

if [ -z "$CORE_BUILD_TARGET" ]; then
  CORE_BUILD_TARGET=""
fi;
echo "LOKit (core) build target: '$CORE_BUILD_TARGET'"


SRCDIR=$(realpath `dirname $0`)
INSTDIR="$SRCDIR/instdir"

if [ -z "$(lsb_release -si)" ]; then
  echo "WARNING: Unable to determine your distribution"
  echo "(Is lsb_release installed?)"
  echo "Using Ubuntu Dockerfile."
  HOST_OS="Ubuntu"
else
  HOST_OS=$(lsb_release -si)
fi
if ! [ -e "$SRCDIR/$HOST_OS" ]; then
  echo "There is no suitable Dockerfile for your host system: $HOST_OS."
  echo "Please fix this problem and re-run $0"
  exit 1
fi
BUILDDIR="$SRCDIR/builddir"

mkdir -p "$BUILDDIR"
cd "$BUILDDIR"

rm -rf "$INSTDIR" || true
mkdir -p "$INSTDIR"

##### build static poco #####

if test ! -f poco/lib/libPocoFoundation.a ; then
    wget https://pocoproject.org/releases/poco-1.12.5p2/poco-1.12.5p2-all.tar.gz
    tar -xzf poco-1.12.5p2-all.tar.gz
    cd poco-1.12.5p2-all/
    ./configure --static --no-tests --no-samples --no-sharedlibs --cflags="-fPIC" --omit=Zip,Data,Data/SQLite,Data/ODBC,Data/MySQL,MongoDB,PDF,CppParser,PageCompiler,Redis,Encodings,ActiveRecord --prefix=$BUILDDIR/poco
    make -j $(nproc)
    make install
    cd ..
fi


##### cloning & updating #####

# core repo
if test ! -d core ; then
  git clone https://git.libreoffice.org/core || exit 1
fi

( cd core && git fetch --all && git checkout $CORE_BRANCH && ./g pull -r ) || exit 1


# online repo
if test ! -d online ; then
  git clone --depth=1 "$COLLABORA_ONLINE_REPO" online || exit 1
fi

( cd online && git fetch --all && git checkout -f $COLLABORA_ONLINE_BRANCH && git clean -f -d && git pull -r ) || exit 1


# brand repo
if test ! -d online-branding ; then
  git clone git@gitlab.collabora.com:productivity/online-branding.git online-branding || echo "Could not clone this proprietary repo"
fi

if test -d online-branding ; then
  ( cd online-branding && git pull -r ) || exit 1
fi

##### LOKit (core) #####

# build
if [ "$CORE_BRANCH" == "distro/collabora/co-25.04" ]; then
  ( cd core && ./autogen.sh --with-distro=CPLinux-LOKit --disable-epm --without-package-format --disable-symbols ) || exit 1
else
  ( cd core && ./autogen.sh --with-distro=LibreOfficeOnline ) || exit 1
fi
( cd core && make $CORE_BUILD_TARGET ) || exit 1

# copy stuff
mkdir -p "$INSTDIR"/opt/
cp -a core/instdir "$INSTDIR"/opt/lokit

##### coolwsd & cool #####

# build
( cd online && ./autogen.sh ) || exit 1
( cd online && ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --enable-silent-rules --disable-tests --with-lokit-path="$BUILDDIR"/core/include --with-lo-path=/opt/lokit --with-poco-includes=$BUILDDIR/poco/include --with-poco-libs=$BUILDDIR/poco/lib $ONLINE_EXTRA_BUILD_OPTIONS) || exit 1
( cd online && make -j $(nproc)) || exit 1

# copy stuff
( cd online && DESTDIR="$INSTDIR" make install ) || exit 1

##### online branding #####
if test -d online-branding ; then
  if ! which sass &> /dev/null; then npm install -g sass; fi
  cd online-branding
  ./brand.sh $INSTDIR/opt/lokit $INSTDIR/usr/share/coolwsd/browser/dist CODE # CODE
  ./brand.sh $INSTDIR/opt/lokit $INSTDIR/usr/share/coolwsd/browser/dist NC-theme-community # Nextcloud Office
  cd ..
fi

# Create new docker image
if [ -z "$NO_DOCKER_IMAGE" ]; then
  cd "$SRCDIR"
  cp ../from-packages/scripts/start-collabora-online.sh .
  docker build --no-cache -t $DOCKER_HUB_REPO:$DOCKER_HUB_TAG -f $HOST_OS . || exit 1
else
  echo "Skipping docker image build"
fi;
