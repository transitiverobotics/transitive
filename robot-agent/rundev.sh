# run robot agent in dev mode (by-pass some restrictions, and source env)
DIR=$PWD; (cd ~/.transitive && env $(cat .env | grep -v ^# | xargs) TR_DEVMODE=TRUE node $DIR/index.js)
