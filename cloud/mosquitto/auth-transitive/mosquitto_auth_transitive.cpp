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

#include <chrono> // for cron jobs
#include <ctime>


using std::cout;
using std::endl;

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


typedef struct user_struct {
  std::string jwt_secret; // JWT secret
  std::map<std::string, long int> cap_usage; // per capability usgae
  bool canPay; // has free account or has a valid payment method and is not delinquent
} user;

std::map<std::string, user> users;

const long int maxBytes = 100 * 1024 * 1024;
// const long int maxBytes = 100 * 1024; // #DEBUG

const time_t cacheExpiration = 300; // seconds
// cache of client permissions
std::map<std::string, std::map<std::string, time_t>> clientPermissions;


/* ----------------------------------------------------------------------------
* Mongo
*/

/** Connect to MongoDB (at most once) and get accounts collection. */
mongocxx::collection& getAccountsCollection() {
  static mongocxx::instance instance{}; // This should be done only once.
  static mongocxx::uri uri("mongodb://mongodb:27017");
  static mongocxx::client client(uri);
  static auto db = client["transitive"];
  static mongocxx::collection accounts = db["accounts"];

  return accounts;
}

void refetchUsers() {
  cout << "refetchUsers" << endl << std::flush;

  // mongocxx::options::find opts{};
  // specify fields we want
  // auto projection = make_document(kvp("jwtSecret", 1));
  // auto projection = document{};
  // projection.append(kvp("jwtSecret", types::b_int32{1}));
  // projection.append(kvp("free", types::b_int32{1}));
  // projection.append(kvp("free", types::b_int32{1}));
  // opts.projection(projection);
  // auto cursor_all = accounts.find({}, opts);
  auto cursor_all = getAccountsCollection().find({});

  for (auto doc : cursor_all) {
    std::string user = (std::string)doc["_id"].get_string().value;
    cout << user;

    // get user's jwt secret
    auto jwtSecretField = doc["jwtSecret"];
    if (jwtSecretField) {
      std::string jwtSecret = (std::string)jwtSecretField.get_string().value;
      users[user].jwt_secret = jwtSecret;
      cout << " " << jwtSecret;
    }

    // check whether user can pay:
    users[user].canPay = (doc["free"] && doc["free"].get_bool().value)
    || ( // has payment method
      ( doc["stripeCustomer"] &&
        doc["stripeCustomer"]["invoice_settings"] &&
        doc["stripeCustomer"]["invoice_settings"]["default_payment_method"] &&
        doc["stripeCustomer"]["invoice_settings"]["default_payment_method"]
          .type() == bsoncxx::type::k_string
      ) && // not delinquent
      !doc["stripeCustomer"]["delinquent"].get_bool().value
    );
    cout << " " << users[user].canPay;

    // get current month's metered usage per capability
    if (doc["cap_usage"]) {
      for (auto &e : doc["cap_usage"].get_document().value) {
        users[user].cap_usage[(std::string)e.key()] = e.get_int64().value;
        cout << "\n " << e.key() << ": "
        << users[user].cap_usage[(std::string)e.key()];
      }
    }

    cout << endl;
  }
  cout << endl;
}

/** Print all read counts. For each user and cap, print read bytes. */
void printReadCounts() {
  for (auto it = users.cbegin(); it != users.cend(); ++it) {
    auto cap_usage = it->second.cap_usage;
    for (auto it2 = cap_usage.cbegin(); it2 != cap_usage.cend(); ++it2) {
      cout << "reads: " << it->first << ", " << it2->first << ": "
      << it2->second << endl;
    }
  }
}

/** Record current meter readings in Mongo. */
void recordMeterToMongo() {

  for (auto it = users.cbegin(); it != users.cend(); ++it) {

    auto cap_usage = it->second.cap_usage;
    auto meter = bsoncxx::builder::basic::document{};
    for (auto it2 = cap_usage.cbegin(); it2 != cap_usage.cend(); ++it2) {
      meter.append(kvp(it2->first, bsoncxx::types::b_int64{it2->second}));
    }
    auto update_one_result = getAccountsCollection()
        .update_one(make_document(kvp("_id", it->first)),
        make_document(kvp("$set",
          make_document(kvp("cap_usage", meter))
        )));
    cout << "updated " << it->first << " "
    << update_one_result->modified_count() << endl;
  }
}


/** Authenticate websocket users, verifying and matching the jwt token they
provide as password against their username. */
static int basic_auth_callback(int event, void *event_data, void *userdata) {

	struct mosquitto_evt_basic_auth *ed = (mosquitto_evt_basic_auth *)event_data;
	const char *username = mosquitto_client_username(ed->client);
  const char *jwt_token = ed->password;

	UNUSED(event);
	UNUSED(userdata);
  cout << "basic auth check: " << username << endl;

  if (!username || !jwt_token) {
    return MOSQ_ERR_AUTH;
  }

  // parse username (json)
  picojson::value doc;
  std::string err = picojson::parse(doc, username);
  if (! err.empty()) {
    std::cerr << "Can't parse username as JSON:" << err << endl;
    return MOSQ_ERR_AUTH;
  }
  picojson::object docObj = doc.get<picojson::object>();

  if (!docObj["id"].is<std::string>()) {
    std::cerr << "Id missing from username" << endl;
    return MOSQ_ERR_AUTH;
  }

  // make sure we have the JWT for this user
  std::string name = docObj["id"].get<std::string>();
  user u = users[name];
  if (u.jwt_secret.empty()) {
    refetchUsers();
    u = users[name];
  }

  if (u.jwt_secret.empty()) {
    cout << "User has no JWT secret: " << name << endl;
    return MOSQ_ERR_AUTH;
  }

  auto verifier = jwt::verify()
      .allow_algorithm(jwt::algorithm::hs256{u.jwt_secret});

  try {
   	auto decoded = jwt::decode(jwt_token);
    verifier.verify(decoded);

    // Check that decoded.payload == username.payload
    if (!docObj["payload"].is<picojson::object>() ||
      decoded.get_payload_json() != docObj["payload"].get<picojson::object>()) {
      cout << "WARN: username payload and JWT payload don't match!"
      << endl;
      return MOSQ_ERR_AUTH;
    }

    // Verify that JWT is still valid
    std::time_t currentTime = std::time(nullptr);
    auto payload = docObj["payload"].get<picojson::object>();
    if (!(payload["validity"].is<double>() && payload["iat"].is<double>() &&
        (payload["iat"].get<double>() + payload["validity"].get<double>())
        > currentTime)) {
      cout << "WARN: JWT is expired! " << endl;
      return MOSQ_ERR_AUTH;
    }

    cout << "verified id " << name << " " << jwt_token << endl;

  } catch (const jwt::error::invalid_json_exception& e) {
    cout << "WARN: invalid json in JWT!" << endl;
    return MOSQ_ERR_AUTH;
  } catch (const jwt::error::signature_verification_exception& e) {
    cout << "WARN: signature invalid!" << endl;
    return MOSQ_ERR_AUTH;
  } catch (const std::invalid_argument& e) {
    cout << "WARN: invalid_argument: " << jwt_token << endl;

    return MOSQ_ERR_ACL_DENIED;
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

typedef struct lastTime_struct {
  int hour = 0;
  int minute = 0;
} lastTime;

/** A "cron" function, called regularly, it checks for jobs that need to run */
static void cron() {

  static lastTime last;

  // get current time, broken down by minute and hour
  auto now = std::chrono::system_clock::now();
  std::time_t now_time_t = std::chrono::system_clock::to_time_t(now);
  std::tm* now_tm = std::localtime(&now_time_t);

  if (now_tm->tm_min > last.minute) {
    // cout << "new minute: " << now_tm->tm_min << endl;
    last.minute = now_tm->tm_min;

    printReadCounts();
  }

  if (now_tm->tm_hour > last.hour) {
    // cout << "new hour: " << now_tm->tm_hour << endl;
    last.hour = now_tm->tm_hour;

    recordMeterToMongo();
  }
}


/** The mosquitto ACL callback */
static int acl_callback(int event, void *event_data, void *userdata) {

	struct mosquitto_evt_acl_check *ed = (mosquitto_evt_acl_check *)event_data;
	const char *username = mosquitto_client_username(ed->client);
	const char *id = mosquitto_client_id(ed->client);
	const char *ip = mosquitto_client_address(ed->client);

 	UNUSED(event);
	UNUSED(userdata);
  bool output = false;

  cron();

  if (!ed->topic || !id || !username) {
    return MOSQ_ERR_ACL_DENIED;
  }

  std::vector<std::string> topicParts = split(ed->topic, '/');

  if (strcmp("$SYS/broker/uptime", ed->topic) == 0) {
    // everyone is allowed to subscribe to the broker's heartbeat
	  output && printf(": public\n");
    return MOSQ_ERR_SUCCESS;
  }

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
      users[user].cap_usage[capability] += ed->payloadlen;

      if (!users[user].canPay && users[user].cap_usage[capability] > maxBytes
        // TODO: get list of limited capabilities from Mongo; for now just:
        && capability == "ros-tool"
        ) {

        cout << "DENIED, " << user << ", " << capability << ": "
        << users[user].cap_usage[capability] << " exceeds " << maxBytes << endl;
        return MOSQ_ERR_ACL_DENIED;
      }
    }
  }

  try {
    if (prefix("{", username)) {
      // The username is a JSON string, from a websocket client

      std::time_t currentTime = std::time(nullptr);

      // check cache
      time_t cached = clientPermissions[id][ed->topic];
      if (cached + cacheExpiration > currentTime ) {
        // cache hit
        return MOSQ_ERR_SUCCESS;
      }

      bool readAccess =
        ed->access == MOSQ_ACL_READ || ed->access == MOSQ_ACL_SUBSCRIBE;
      if (isAuthorized(topicParts, username, readAccess)) {
        // add to cache
        clientPermissions[id][ed->topic] = currentTime;
        return MOSQ_ERR_SUCCESS;
      }

      // TODO: also cache disallowed clients, to avoid (unintentional) denial of
      // service attacks when a client malfunctions; Maybe combine with caching
      // validity of JWT instead of having a fixed cache expiration time?
      return MOSQ_ERR_ACL_DENIED;
    }

  } catch (const std::bad_alloc& e) {
    std::cerr << "bad_alloc: " << e.what() << " " << username << " "
    << ed->topic << " " << id << std::endl;

    return MOSQ_ERR_ACL_DENIED;

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


  // if (ed->access == MOSQ_ACL_READ) {
  //   printf("read request for: %s %d\n", ed->topic, ed->payloadlen);
  // }

  char orgId[80], deviceId[80], scope[80], name[80];
  int result = sscanf(ed->topic, "/%79[^/]/%79[^/]/%79[^/]/%79[^/]/",
            orgId, deviceId, scope, name);
  if (result != 4) {
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

/** Clean up hash tables when client disconnects */
static int on_disconnect_callback(int event, void *event_data, void *userdata) {

	struct mosquitto_evt_disconnect *ed = (mosquitto_evt_disconnect *)event_data;
	const char *username = mosquitto_client_username(ed->client);
	const char *id = mosquitto_client_id(ed->client);
	const char *ip = mosquitto_client_address(ed->client);

  cout << "Client disconnected: " << id << " " << ip << endl;

  if (id) {
    clientPermissions.erase(id);
  }
  // TODO: also clear write rate limiting hash table, but wait until we've ported
  // that to C++ (a std::map).

  return MOSQ_ERR_SUCCESS;
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

  int disconnect_result = mosquitto_callback_register(mosq_pid, MOSQ_EVT_DISCONNECT,
    on_disconnect_callback, NULL, NULL);

  return acl_result | auth_result | disconnect_result;
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
