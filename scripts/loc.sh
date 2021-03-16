#!/bin/bash

# lines of code in this project

wc $(find . | grep -v node_modules | grep -v \.meteor | grep -v build \
| grep -v bundle.js | grep -e jsx$ -e js$ -e html$ | xargs)
