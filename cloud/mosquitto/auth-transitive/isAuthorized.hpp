
// #include <stdio.h>
// #include <string.h>
// #include <stdlib.h> // system calls
#include <time.h> // for timing the reduction of counters

#include <string>
// #include <map>
// #include <utility>

// #include <sstream>
#include <vector>
#include <numeric> // std::accumulate

// for MongoDB
#include <cstdint>
#include <iostream>
#include <vector>
#include <bsoncxx/builder/basic/document.hpp>
#include <bsoncxx/json.hpp>
#include <mongocxx/client.hpp>
#include <mongocxx/instance.hpp>
#include <mongocxx/stdx.hpp>
#include <mongocxx/uri.hpp>
using bsoncxx::builder::basic::kvp;
using bsoncxx::builder::basic::make_array;
using bsoncxx::builder::basic::make_document;
// using bsoncxx::builder::stream::document;
using bsoncxx::v_noabi::document::element;


#define AGENT_CAP "@transitive-robotics/_robot-agent"


/* -------------------------------------------------------------------------- */

inline bool operator==(const element& a, const std::string& b) {
  return a.get_string().value.data() == b;
}

inline bool operator==(const element& a, const char* b) {
  return a == std::string(b);
}

inline bool operator==(const element& a, const element& b) {
  return a.get_string().value == b.get_string().value;
}

// double operator+(const element& a, const element& b) {
//   return a.get_double().value + b.get_double().value;
// }
int operator+(const element& a, const element& b) {
  return a.get_int32().value + b.get_int32().value;
}

/* -------------------------------------------------------------------------- */

/** Whether or not the given string is contained in the array. */
bool arrayIncludes(const element& array, const std::string& s) {
  bsoncxx::array::view view{array.get_array().value};

  for (bsoncxx::array::element item : view){
    std::cout << item.get_string().value << std::endl;
    if (item.get_string().value.data() == s) {
      return true;
    }
  }
  return false;
}

/** Given a user's json, payload from JWT verified during basic_auth, and a
topic, decide whether the user should be granted access to the given topic.
*/
static int isAuthorized(std::vector<std::string> topicParts, std::string username,
  bool readAccess = false) {

  auto doc = bsoncxx::from_json(username);
  auto permitted = doc["payload"];


  // requested
  auto org = topicParts[1];
  auto device = topicParts[2];
  auto capability = topicParts[3] + '/' + topicParts[4];

  /// join the topicParts of the sub-topic
  std::string sub = std::accumulate(
    std::next(topicParts.begin() + 6),
    topicParts.end(),
    topicParts[6],
    [](std::string a, std::string b) {
      return a + "/" + b;
    }
  );
  // std::cout << "sub: " << sub << std::endl;

  // std::stringstream sub;
  // s << R"({ "id": "user1", "payload": {
  // "id": "user1", "device": "dev1", "capability": "@scope/capName",
  // "validity": 10, "iat":)" << currentTime - 20 << "}}";


  bool deviceMatch = (permitted["device"] == device);
  bool capMatch = (permitted["capability"] == capability);
  bool agentPermission = (permitted["capability"] == AGENT_CAP);
  bool agentRequested = (capability == AGENT_CAP);
  bool fleetPermission = (permitted["device"] == "_fleet");
  bool noTopicConstraints = !permitted["topics"];

  // for (auto p : topicParts) std::cout << p << '/';
  // std::cout << "  authorized?" << " " << username << " " << readAccess << std::endl;
  // std::cout << deviceMatch << capMatch << agentPermission << agentRequested
  // << fleetPermission << noTopicConstraints << std::endl;

  std::time_t currentTime = std::time(nullptr);

  if (
    doc["id"] == permitted["id"] && doc["id"] == org &&
    // JWT still valid
    permitted["validity"] && permitted["iat"] &&
    // (permitted["iat"].get_int32().value +
    //   permitted["validity"].get_int32().value) > currentTime
    (permitted["iat"] + permitted["validity"]) > currentTime &&
    (
      ( deviceMatch && (
          (
            ( capMatch || agentPermission )
            // _robot-agent permissions grant full device access
            &&
            // if payload.topics exists it is a limitation of topics to allow:
            (noTopicConstraints || arrayIncludes(permitted["topics"], sub))
            // TODO: allow wildcards in permitted.topics ?
          ) ||
          // all valid JWTs for a device also grant read access to _robot-agent
          ( readAccess && agentRequested )
        )
      )

      || // _fleet permissions give read access also to all devices' robot-agents
      ( fleetPermission && readAccess && agentRequested && noTopicConstraints)

      || // _fleet permissions give access to all devices' data for the
      // cap (in the permitted org only of course); _robot-agent permissions
      // grant access to all devices in the fleet
      ( fleetPermission && (capMatch || agentPermission) && noTopicConstraints)
    )) {

    // std::cout << ": yes!" << std::endl;
    return true;

  } else {
    // std::cout << ": no!" << std::endl;
    return false;
  }
}
