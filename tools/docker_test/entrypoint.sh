#!/bin/bash

echo 172.17.0.1 ${HOST} {registry,portal,data,auth,install,repo,mqtt}.${HOST} >> /etc/hosts

hostname > /etc/machine-id

bash
