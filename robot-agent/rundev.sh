# run robot agent in dev mode (by-pass some restrictions, and source env)
touch ~/.transitive/DEVMODE
DIR=$PWD; (cd ~/.transitive && env $(cat .env | grep -v ^# | xargs) node $DIR/index.js)
