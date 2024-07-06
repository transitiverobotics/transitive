#include "config.h"

#include <stdio.h>
#include <string.h>
#include <stdlib.h> // system calls
#include <time.h> // for timing the reduction of counters

#include "mosquitto_broker.h"
#include "mosquitto_plugin.h"
#include "mosquitto.h"
#include "mqtt_protocol.h"
#include "uthash.h" // https://troydhanson.github.io/uthash/

#include <string>
#include <map>
#include <utility>

#include <iostream>
#include <sstream>
#include <vector>

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

// JWT
#include <jwt-cpp/jwt.h>

#include "isAuthorized.hpp"


static mosquitto_plugin_id_t *mosq_pid = NULL;

/** return true if is `pre` a prefix of `str` */
bool prefix(const char *pre, const char *str) {
  return strncmp(pre, str, strlen(pre)) == 0;
}

// max function, from https://stackoverflow.com/a/58532788/1087119
#define max(a,b)             \
({                           \
    __typeof__ (a) _a = (a); \
    __typeof__ (b) _b = (b); \
    _a > _b ? _a : _b;       \
})

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



typedef struct metering_struct {
  long int hour;
  long int month;
} metering;

typedef struct user_struct {
  std::string jwt_secret; // JWT secret
  std::map<std::string, metering> cap_usage; // per capability usgae
} user;

std::map<std::string, user> users;

const long int maxBytes = 100 * 1024 * 1024;


/* ----------------------------------------------------------------------------
* Mongo
*/

void refetchUsers() {
  std::cout << "refetchUsers" << std::endl << std::flush;

  static mongocxx::instance instance{}; // This should be done only once.
  static mongocxx::uri uri("mongodb://mongodb:27017");
  static mongocxx::client client(uri);
  static auto db = client["transitive"];
  static auto accounts = db["accounts"];

  mongocxx::options::find opts{};
  // specify fields we want
  opts.projection(make_document(kvp("jwtSecret", 1)));
  auto cursor_all = accounts.find({}, opts);

  for (auto doc : cursor_all) {
    std::string user = (std::string)doc["_id"].get_string().value;
    auto jwtSecretField = doc["jwtSecret"];
    if (jwtSecretField) {
      std::string jwtSecret = (std::string)jwtSecretField.get_string().value;
      users[user].jwt_secret = jwtSecret;
      std::cout << user << " " << jwtSecret << std::endl;
    }
  }
  std::cout << std::endl;
}


/** Compare a picojson::value to a bsonxx::element.
  WIP! So far only comparing strings and int32, which is all we need for now.
*/
inline bool operator==(const picojson::object& a, const element& b) {

  for (auto& e : a) {
    // std::cout << "checking " << e.first << ": " << e.second << std::endl;
    auto el = b[e.first];

    if (el.type() == bsoncxx::type::k_string) {

      // std::cout << "Checking " << e.first << ": " << e.second.get<std::string>()
      // << " =? " << el.get_string().value << std::endl;

      if (e.second.get<std::string>() != el.get_string().value.data()) {

        std::cout << "WARN: username payload and JWT don't match on "
        << e.first << ": " << e.second << " != " << el.get_string().value
        << std::endl;
        return false;
      }
    } else if (el.type() == bsoncxx::type::k_int32) {

      // std::cout << "Checking " << e.first << ": " << e.second.get<double>()
      // << " =? " << el.get_int32().value << std::endl;

      if (e.second.get<double>() != el.get_int32().value) {
        std::cout << "WARN: username payload and JWT don't match on "
        << e.first << ": " << e.second << " != " << el.get_int32().value
        << std::endl;
        return false;
      }
    }
  }

  return true;
}


/** Authenticate websocket users, verifying and matching the jwt token they
provide as password against their username. */
static int basic_auth_callback(int event, void *event_data, void *userdata) {

	struct mosquitto_evt_basic_auth *ed = (mosquitto_evt_basic_auth *)event_data;
	const char *username = mosquitto_client_username(ed->client);
  const char *jwt_token = ed->password;

	UNUSED(event);
	UNUSED(userdata);

  // used for websockets only
  std::cout << "basic auth " << username << std::endl;
  auto doc = bsoncxx::from_json(username);

  // TODO: use picojson here instead (same as in JWT)!!

  std::string name = (std::string)doc["id"].get_string().value;
  user u = users[name];
  if (u.jwt_secret.empty()) {
    refetchUsers();
    u = users[name];
  }

  auto verifier = jwt::verify()
      .allow_algorithm(jwt::algorithm::hs256{u.jwt_secret});

  try {
   	auto decoded = jwt::decode(jwt_token);
    verifier.verify(decoded);

    // Check that decoded.payload == username.payload
    if (decoded.get_payload_json() != doc["payload"]) {
      std::cout << "WARN: username payload and JWT payload don't match!"
      << std::endl;
      return MOSQ_ERR_AUTH;
    }
    std::cout << "verified id " << name << " " << jwt_token << std::endl;

  } catch (const jwt::error::invalid_json_exception& e) {
    std::cout << "WARN: invalid json in JWT!" << std::endl;
    return MOSQ_ERR_AUTH;
  } catch (const jwt::error::signature_verification_exception& e) {
    std::cout << "WARN: signature invalid!" << std::endl;
    return MOSQ_ERR_AUTH;
  }

  return MOSQ_ERR_SUCCESS;
}


/* ---------------------------------------------------------------------------
Rate limiting
*/

#define THRESHOLD 200 // permitted requests per second before rate limiting
#define BURST_THRESHOLD 2 * THRESHOLD // permitted bursts

struct client_struct {
  char id[80];   /* client username */
  char ip[16];   /* the client IP */
  int count;
  bool isLimited;    // whether we've added this client to the `limit` ipset
  UT_hash_handle hh; /* makes this structure hashable */
};

struct client_struct *clients = NULL;

/** Add client to the hashtable where we count write requests */
void add_client(const char *client_id, const char *ip) {
  printf("adding client ip %s\n", ip);
  struct client_struct *client = (struct client_struct *)malloc(sizeof *clients);
  strcpy(client->id, client_id);
  strcpy(client->ip, ip);
  client->count = 0;
  client->isLimited = false;
  HASH_ADD_STR(clients, id, client);
}

/** add or remove the given client to/from the ipset */
void update_ipset(const char *ip, bool add) {
  // printf("%s-ing ip to ipset\n", add ? "add" : "del");
  printf("%s ipset 'limit' %s\n",
    add ? "adding ip to" : "deleting ip from",
    ip);

  char cmd[80];
  sprintf(cmd, "ipset %s limit %s", add ? "add" : "del", ip);
  printf("running %s\n", cmd);
  int status = system(cmd);
  printf("result %d\n", status);
  fflush(stdout);
}

// last time we ran counter-reduction
time_t last_time = 0;
/** reduce all counters every time two or more seconds have passed */
void reduce_write_counters() {
  time_t current_time = time(NULL);
  time_t time_diff = current_time - last_time;
  if (time_diff >= 2) {
    struct client_struct *client, *tmp;
    HASH_ITER(hh, clients, client, tmp) {
      if (client->count > 0) {
        printf("reducing client counter %s (%s): %d\n",
          client->id, client->ip, client->count);
        // reduce all counters by THRESHOLD per second
        client->count = max(client->count - THRESHOLD * time_diff, 0);
        if (client->isLimited && client->count < THRESHOLD) {
          // client is behaving again, remove from rate limiting ipset.
          update_ipset(client->ip, false);
          client->isLimited = false;
        }
      }
    }
    last_time = current_time;
  }
  fflush(stdout);
}

/** Find the write-counter for this client/IP and update it */
void update_write_counter(const char *client_id, const char *ip) {
  struct client_struct *client = NULL;
  HASH_FIND_STR(clients, client_id, client);
  if (client) {
    client->count++;
    if (!client->isLimited && client->count > BURST_THRESHOLD) {
      // client is misbehaving: add to rate limiting ipset
      printf("client %s (%s) has reached write rate limit: %d\n",
        client->id, client->ip, client->count);
      update_ipset(client->ip, true);
      client->isLimited = true;
    }
  } else {
    add_client(client_id, ip);
  }
}

/* -------------------------------------------------------------------------- */

/** The mosquitto ACL callback */
static int acl_callback(int event, void *event_data, void *userdata) {

	struct mosquitto_evt_acl_check *ed = (mosquitto_evt_acl_check *)event_data;
	const char *username = mosquitto_client_username(ed->client);
	const char *id = mosquitto_client_id(ed->client);
	const char *ip = mosquitto_client_address(ed->client);

 	UNUSED(event);
	UNUSED(userdata);
  bool output = false;

  std::vector<std::string> topicParts = split(ed->topic, '/');

  if (strcmp("$SYS/broker/uptime", ed->topic) == 0) {
    // everyone is allowed to subscribe to the broker's heartbeat
	  output && printf(": public\n");
    return MOSQ_ERR_SUCCESS;
  }

  if (prefix("{", username)) {
    // The username is a JSON string, from a websocket client
    return isAuthorized(topicParts, username, ed->access == MOSQ_ACL_READ) ?
    MOSQ_ERR_SUCCESS : MOSQ_ERR_ACL_DENIED;
  }

  if (ed->access == MOSQ_ACL_WRITE) {
    reduce_write_counters();
    update_write_counter(username, ip);

    output = true;
   	printf("write request: %s %s %s", ed->topic, username, id);
  } else if (ed->access == MOSQ_ACL_SUBSCRIBE) {
    output = true;
   	printf("subscribe request: %s %s %s", ed->topic, username, id);
  }
  // not printing READ requests, because they are too verbose


  // is it a superuser?
  if (prefix("transitiverobotics:", username)) {
	  output && printf(": superuser\n");
    return MOSQ_ERR_SUCCESS;
  }


  // meter reads and deny if over limit
  if (ed->access == MOSQ_ACL_READ) {
    // printf("read request for: %s %d\n", ed->topic, ed->payloadlen);

    if (topicParts[0][0] != '$') {
      std::string user = topicParts[1];
      std::string capability = topicParts[4];
      users[user].cap_usage[capability].hour += ed->payloadlen;
      users[user].cap_usage[capability].month += ed->payloadlen;
      std::cout << user << ", " << capability << ": "
      << users[user].cap_usage[capability].month << std::endl;

      if (users[user].cap_usage[capability].month > maxBytes) {
        // TODO: check whether user has a payment method, if so, allow

        std::cout << "DENIED " << user << " " << capability << ": "
        << users[user].cap_usage[capability].month << " " << maxBytes << std::endl;
        return MOSQ_ERR_ACL_DENIED;
      }
    }
  }


  // if (ed->access == MOSQ_ACL_READ) {
  //   printf("read request for: %s %d\n", ed->topic, ed->payloadlen);
  // }

  char orgId[80], deviceId[80], scope[80], name[80];
  int result = sscanf(ed->topic, "/%79[^/]/%79[^/]/%79[^/]/%79[^/]/",
            orgId, deviceId, scope, name);
  if(result != 4) {
    printf("error parsing topic\n");
    return MOSQ_ERR_ACL_DENIED;
  }
  // printf("topic parts: %s %s %s %s\n", orgId, deviceId, scope, name);

  // does the user have access to this topic?
  if (prefix("cap:", username)) {
    // it's a cloud capability: give access to cap's namespace
    char user_scope[80], user_name[80];
    if (sscanf(username + 4, "%79[^/]/%s", user_scope, user_name) != 2) {
  	  printf(": DENIED (%s)\n", ip);
      return MOSQ_ERR_ACL_DENIED;
    }
    if (strcmp(user_scope, scope) != 0 || strcmp(user_name, name) != 0) {
  	  printf(": DENIED (%s)\n", ip);
      return MOSQ_ERR_ACL_DENIED;
    }
	  output && printf(": capability namespace matches\n");
  } else {
    char user_orgId[80], user_deviceId[80];
    if (sscanf(username, "%79[^:]:%s", user_orgId, user_deviceId) != 2) {
  	  printf(": DENIED (%s)\n", ip);
      return MOSQ_ERR_ACL_DENIED;
    }
    if (strcmp(user_orgId, orgId) != 0 || strcmp(user_deviceId, deviceId) != 0) {
  	  printf(": DENIED (%s)\n", ip);
      return MOSQ_ERR_ACL_DENIED;
    }
	  output && printf(": device namespace matches\n");
  }

  // if we made it here, we are good
  return MOSQ_ERR_SUCCESS;

	// switch(ed->access){
	// 	case MOSQ_ACL_SUBSCRIBE:
	// 		return acl_check(event_data, acl_check_subscribe, default_access.subscribe);
	// 		break;
	// 	case MOSQ_ACL_UNSUBSCRIBE:
	// 		return acl_check(event_data, acl_check_unsubscribe, default_access.unsubscribe);
	// 		break;
	// 	case MOSQ_ACL_WRITE: /* Client to broker */
	// 		return acl_check(event_data, acl_check_publish_c_send, default_access.publish_c_send);
	// 		break;
	// 	case MOSQ_ACL_READ:
	// 		return acl_check(event_data, acl_check_publish_c_recv, default_access.publish_c_recv);
	// 		break;
	// 	default:
	// 		return MOSQ_ERR_PLUGIN_DEFER;
	// }
	// return MOSQ_ERR_PLUGIN_DEFER;
}


int mosquitto_plugin_version(int supported_version_count,
  const int *supported_versions) {

 	int i;
  printf("version?\n");
	for (i = 0; i<supported_version_count; i++) {
		if (supported_versions[i] == 5) {
			return 5;
		}
	}
	return -1;
}


int mosquitto_plugin_init(mosquitto_plugin_id_t *identifier, void **user_data,
  struct mosquitto_opt *opts, int opt_count) {

	UNUSED(user_data);
	// UNUSED(opts);
	// UNUSED(opt_count);

  printf("init\n");
  // flush all `ipset`s
  system("ipset flush");

  // example code for getting opts and env vars
  printf("init message plugin, %d %s\n", opt_count, getenv("TR_BILLING_SERVICE"));
  for (int i = 0; i < opt_count; i++) {
    printf("option: %s = %s\n", opts[i].key, opts[i].value);
  }

  refetchUsers();

	mosq_pid = identifier;
  int acl_result = mosquitto_callback_register(mosq_pid, MOSQ_EVT_ACL_CHECK, acl_callback,
    NULL, NULL);

  int auth_result = mosquitto_callback_register(mosq_pid, MOSQ_EVT_BASIC_AUTH,
    basic_auth_callback, NULL, NULL);

  return acl_result | auth_result;
  // #TODO: register a MOSQ_EVT_DISCONNECT callback to remove clients from
  // hashtable?
}


int mosquitto_plugin_cleanup(void *user_data, struct mosquitto_opt *opts,
  int opt_count) {

	UNUSED(user_data);
	UNUSED(opts);
	UNUSED(opt_count);

	return mosquitto_callback_unregister(mosq_pid, MOSQ_EVT_ACL_CHECK,
    acl_callback, NULL);
}
