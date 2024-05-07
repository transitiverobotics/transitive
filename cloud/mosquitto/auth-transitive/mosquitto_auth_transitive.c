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

#define THRESHOLD 200 // permitted requests per second before rate limiting
#define BURST_THRESHOLD 2 * THRESHOLD // permitted bursts

// static int basic_auth_callback(int event, void *event_data, void *userdata)
// {
// 	struct mosquitto_evt_basic_auth *ed = event_data;
// 	UNUSED(event);
// 	UNUSED(userdata);

// 	printf("unused basic auth %s\n", ed->username);
//   // currently assume we use `use_identity_as_username true` so this function is
//   // not called
//   return MOSQ_ERR_AUTH;
// }

int counter = 0;

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
  const char cmd[80];
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

/** The mosquitto ACL callback */
static int acl_callback(int event, void *event_data, void *userdata)
{
	struct mosquitto_evt_acl_check *ed = event_data;
	const char *username = mosquitto_client_username(ed->client);
	const char *id = mosquitto_client_id(ed->client);
	const char *ip = mosquitto_client_address(ed->client);

  bool output = false;
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

 	UNUSED(event);
	UNUSED(userdata);

  // is it a superuser?
  if (prefix("transitiverobotics:", username)) {
	  output && printf(": superuser\n");
    return MOSQ_ERR_SUCCESS;
  }


  if (strcmp("$SYS/broker/uptime", ed->topic) == 0) {
    // everyone is allowed to subscribe to the broker's heartbeat
	  output && printf(": public\n");
    return MOSQ_ERR_SUCCESS;
  }

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
  const int *supported_versions)
{
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
  struct mosquitto_opt *opts, int opt_count)
{
	UNUSED(user_data);
	UNUSED(opts);
	UNUSED(opt_count);

  printf("init\n");
  // flush all `ipset`s
  system("ipset flush");

	mosq_pid = identifier;
  return mosquitto_callback_register(mosq_pid, MOSQ_EVT_ACL_CHECK, acl_callback,
    NULL, NULL);

  // #TODO: register a MOSQ_EVT_DISCONNECT callback to remove clients from
  // hashtable?
}

int mosquitto_plugin_cleanup(void *user_data, struct mosquitto_opt *opts,
  int opt_count)
{
	UNUSED(user_data);
	UNUSED(opts);
	UNUSED(opt_count);

	return mosquitto_callback_unregister(mosq_pid, MOSQ_EVT_ACL_CHECK,
    acl_callback, NULL);
}
