#!/bin/bash

# Transitive capability init script

color() {
 echo -e "\x1b[38;5;$1m";
}

NORMAL=$(echo -e "\x1b[0m");
HR="$(color 237)$(printf '%.s─' $(seq 1 $(tput cols)))${NORMAL}"


BASEDIR=$(dirname $(realpath $0))

# Determine folder and ensure it exists
FOLDER=$1

DIR=$PWD/$FOLDER
mkdir -p $DIR
cd $DIR

cp -r $BASEDIR/files/* .

capName=$(basename $DIR)
capNameColor=$(color 130)${capName}${NORMAL}

echo ${HR}
echo Creating ${capNameColor}
echo ${HR}

# Rename web component files to include cap name
mv web/device.jsx web/${capName}-device.jsx
mv web/fleet.jsx web/${capName}-fleet.jsx

# Rename hidden files
rename 's/^_/\./' _*

# Set package name
npm pkg set name="@local/${capName}"

# Run `npm install`, which in dev recurses into robot and cloud as well
npm install | sed "s/^/[$(color 50)npm install${NORMAL}] /"

cat << EOF

${HR}
  Done creating ${capNameColor}! 🚀
  Next, you'll typically start it locally by running $(color 2)npm start${NORMAL} inside the ${capNameColor} folder.
${HR}
EOF
