#!/bin/sh

echo uninstall!

if [ $PWD != ~/.transitive/node_modules/@transitive-robotics/robot-agent ]; then
  echo "refusing to run uninstall; not installed in correct directory";
  exit 1;
fi
