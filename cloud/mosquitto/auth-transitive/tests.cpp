#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"
#include "isAuthorized.hpp"

#include <sstream>


/** Split the given string using the delimiter, return a vector */
std::vector<std::string> split(const std::string &s, char delim, int max = 100) {
  std::vector<std::string> result;
  std::stringstream ss(s);
  std::string item;
  int i = 0;

  while (i++ < max && getline(ss, item, delim)) {
    result.push_back(item);
  }

  return result;
}

TEST_CASE("isAuthorized") {

  std::time_t currentTime = std::time(nullptr);

  std::vector<std::string> topic1 =
    split("/user1/dev1/@scope/capName/0.1.2/myfield", '/');

  std::vector<std::string> topicFleet =
    split("/user1/_fleet/@scope/capName/0.1.2/myfield", '/');

  std::vector<std::string> topicAgent =
    split("/user1/dev1/@transitive-robotics/_robot-agent/0.1.2/myfield", '/');

  std::vector<std::string> topicSubs =
    split("/user1/dev1/@scope/capName/0.1.2/myfield/sub1/sub2", '/');

  std::stringstream simpleDevPermission;
  simpleDevPermission << R"({ "id": "user1", "payload": {
  "id": "user1", "device": "dev1", "capability": "@scope/capName",
  "validity": 1000, "iat":)" << currentTime << "}}";

  std::stringstream simpleFleetPermission;
  simpleFleetPermission << R"({ "id": "user1", "payload": {
  "id": "user1", "device": "_fleet", "capability": "@scope/capName",
  "validity": 1000, "iat":)" << currentTime << "}}";

  SUBCASE("simple") {
    CHECK( isAuthorized(topic1, simpleDevPermission.str()) );
  }

  SUBCASE("simple fleet permission") {
    CHECK( isAuthorized(topic1, simpleFleetPermission.str()) );
  }

  SUBCASE("wrong user") {

    SUBCASE("") {
      std::stringstream s;
      s << R"({ "id": "user2", "payload": {
      "id": "user1", "device": "dev1", "capability": "@scope/capName",
      "validity": 1000, "iat":)" << currentTime << "}}";
      CHECK( !isAuthorized(topic1, s.str()) );
    }

    SUBCASE("") {
      std::stringstream s;
      s << R"({ "id": "user1", "payload": {
      "id": "user2", "device": "dev1", "capability": "@scope/capName",
      "validity": 1000, "iat":)" << currentTime << "}}";
      CHECK( !isAuthorized(topic1, s.str()) );
    }

    SUBCASE("") {
      std::vector<std::string> topic2 =
        split("/user2/dev1/@scope/capName/0.1.2/myfield", '/');
      CHECK( !isAuthorized(topic2, simpleDevPermission.str()) );
    }

  }


  SUBCASE("wrong capability") {
    std::stringstream s;
    s << R"({ "id": "user1", "payload": {
    "id": "user1", "device": "dev1", "capability": "@scope/capNameWrong",
    "validity": 1000, "iat":)" << currentTime << "}}";
    CHECK( !isAuthorized(topic1, s.str()) );
  }

  SUBCASE("wrong device") {
    SUBCASE("another device") {
      std::stringstream s;
      s << R"({ "id": "user2", "payload": {
      "id": "user1", "device": "dev2", "capability": "@scope/capName",
      "validity": 1000, "iat":)" << currentTime << "}}";
      CHECK( !isAuthorized(topic1, s.str()) );
    }

    SUBCASE("fleet topic") {
      CHECK( !isAuthorized(topicFleet, simpleDevPermission.str()) );
    }
  }

  SUBCASE("expired") {
    std::stringstream s;
    s << R"({ "id": "user1", "payload": {
    "id": "user1", "device": "dev1", "capability": "@scope/capName",
    "validity": 10, "iat":)" << currentTime - 20 << "}}";
    CHECK( !isAuthorized(topic1, s.str(), 0) );
  }


  SUBCASE("permitted-topics") {
    SUBCASE("permitted, simple") {
      std::stringstream s;
      s << R"({ "id": "user1", "payload": {
      "id": "user1", "device": "dev1", "capability": "@scope/capName",
      "topics": ["myfield", "myfield2"],
      "validity": 1000, "iat":)" << currentTime << "}}";
      CHECK( isAuthorized(topic1, s.str(), 0) );
    }
    SUBCASE("not permitted, simple") {
      std::stringstream s;
      s << R"({ "id": "user1", "payload": {
      "id": "user1", "device": "dev1", "capability": "@scope/capName",
      "topics": ["myfield3"],
      "validity": 1000, "iat":)" << currentTime << "}}";
      CHECK( !isAuthorized(topic1, s.str(), 0) );
    }

    SUBCASE("permitted, complex") {
      std::stringstream s;
      s << R"({ "id": "user1", "payload": {
      "id": "user1", "device": "dev1", "capability": "@scope/capName",
      "topics": ["myfield/sub1/sub2"],
      "validity": 1000, "iat":)" << currentTime << "}}";
      CHECK( isAuthorized(topicSubs, s.str(), 0) );
    }

    SUBCASE("complex, wrong topic, level1") {
      std::stringstream s;
      s << R"({ "id": "user1", "payload": {
      "id": "user1", "device": "dev1", "capability": "@scope/capName",
      "topics": ["myfield3/sub1/sub2"],
      "validity": 1000, "iat":)" << currentTime << "}}";
      CHECK( !isAuthorized(topicSubs, s.str(), 0) );
    }

    SUBCASE("complex, wrong topic, level2") {
      std::stringstream s;
      s << R"({ "id": "user1", "payload": {
      "id": "user1", "device": "dev1", "capability": "@scope/capName",
      "topics": ["myfield/wrongsub1/sub2"],
      "validity": 1000, "iat":)" << currentTime << "}}";
      CHECK( !isAuthorized(topicSubs, s.str(), 0) );
    }

    SUBCASE("complex, wrong topic, level3") {
      std::stringstream s;
      s << R"({ "id": "user1", "payload": {
      "id": "user1", "device": "dev1", "capability": "@scope/capName",
      "topics": ["myfield/sub1/wrongsub2"],
      "validity": 1000, "iat":)" << currentTime << "}}";
      CHECK( !isAuthorized(topicSubs, s.str(), 0) );
    }
  }

  SUBCASE("robot-agent") {
    SUBCASE("any device token gives read-access only") {
      SUBCASE("") {
        CHECK( !isAuthorized(topicAgent, simpleDevPermission.str()) );
      }
      SUBCASE("") {
        CHECK( isAuthorized(topicAgent, simpleDevPermission.str(), true) );
      }
      SUBCASE("") {
        std::stringstream s;
        s << R"({ "id": "user12", "payload": {
        "id": "user2", "device": "dev1", "capability": "@scope/capName",
        "validity": 1000, "iat":)" << currentTime << "}}";
        CHECK( !isAuthorized(topicAgent, s.str(), true) );
      }
    }

    SUBCASE("any _fleet token gives read-access only") {
      SUBCASE("") {
        CHECK( !isAuthorized(topicAgent, simpleFleetPermission.str()) );
      }
      SUBCASE("") {
        CHECK( isAuthorized(topicAgent, simpleFleetPermission.str(), true) );
      }
    }
  }
}
