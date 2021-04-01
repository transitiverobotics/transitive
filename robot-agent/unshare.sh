#!/bin/bash

CWD=$PWD

mkdir -p /tmp/root
cd /tmp/root
unshare -rm $CWD/unshared.sh $@
