g++ -std=c++2a -Wfatal-errors -fPIC -fmax-errors=1 \
  -I../../include -I../.. -I/tmp/jwt-cpp-0.7.0/include/ -I/tmp/doctest \
  tests.cpp -o tests \
  $(pkg-config --cflags --libs libmongocxx)