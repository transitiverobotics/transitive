
const assert = require('assert');
const { mqttTopicMatch } = require('./mqtt');

describe('utils', function() {

  describe('mqttTopicMatch', function() {
    // examples taken from https://mosquitto.org/man/mqtt-7.html

    const topic = 'a/b/c/d';

    it('should match itself', function() {
      assert(mqttTopicMatch(topic, topic));
    }),

    it('should match examples with "+" wildcards', function() {
      const positive = [
        '+/b/c/d',
        'a/+/c/d',
        'a/+/+/d',
        '+/+/+/+',
      ];
      positive.forEach(sub => assert(mqttTopicMatch(topic, sub)));
    });

    it('should match examples with "#" wildcards', function() {
      const positive = [
        '#',
        'a/#',
        'a/b/#',
        'a/b/c/#',
        '+/b/c/#',
      ];
      positive.forEach(sub => assert(mqttTopicMatch(topic, sub)));
    });

    it('should not match examples with "+" wildcards', function() {
      const negative = [
        'a/b/c',
        'b/+/c/d',
        '+/+/+',
      ];
      negative.forEach(sub =>
        assert(!mqttTopicMatch(topic, sub), `${topic} !~ ${sub}`));
    });
  });
});
