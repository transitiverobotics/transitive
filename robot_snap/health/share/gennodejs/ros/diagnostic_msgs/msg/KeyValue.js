// Auto-generated. Do not edit!

// (in-package diagnostic_msgs.msg)


"use strict";

const _serializer = _ros_msg_utils.Serialize;
const _arraySerializer = _serializer.Array;
const _deserializer = _ros_msg_utils.Deserialize;
const _arrayDeserializer = _deserializer.Array;
const _finder = _ros_msg_utils.Find;
const _getByteLength = _ros_msg_utils.getByteLength;

//-----------------------------------------------------------

class KeyValue {
  constructor(initObj={}) {
    if (initObj === null) {
      // initObj === null is a special case for deserialization where we don't initialize fields
      this.key = null;
      this.value = null;
    }
    else {
      if (initObj.hasOwnProperty('key')) {
        this.key = initObj.key
      }
      else {
        this.key = '';
      }
      if (initObj.hasOwnProperty('value')) {
        this.value = initObj.value
      }
      else {
        this.value = '';
      }
    }
  }

  static serialize(obj, buffer, bufferOffset) {
    // Serializes a message object of type KeyValue
    // Serialize message field [key]
    bufferOffset = _serializer.string(obj.key, buffer, bufferOffset);
    // Serialize message field [value]
    bufferOffset = _serializer.string(obj.value, buffer, bufferOffset);
    return bufferOffset;
  }

  static deserialize(buffer, bufferOffset=[0]) {
    //deserializes a message object of type KeyValue
    let len;
    let data = new KeyValue(null);
    // Deserialize message field [key]
    data.key = _deserializer.string(buffer, bufferOffset);
    // Deserialize message field [value]
    data.value = _deserializer.string(buffer, bufferOffset);
    return data;
  }

  static getMessageSize(object) {
    let length = 0;
    length += object.key.length;
    length += object.value.length;
    return length + 8;
  }

  static datatype() {
    // Returns string type for a message object
    return 'diagnostic_msgs/KeyValue';
  }

  static md5sum() {
    //Returns md5sum for a message object
    return 'cf57fdc6617a881a88c16e768132149c';
  }

  static messageDefinition() {
    // Returns full string definition for message
    return `
    string key # what to label this value when viewing
    string value # a value to track over time
    
    `;
  }

  static Resolve(msg) {
    // deep-construct a valid message object instance of whatever was passed in
    if (typeof msg !== 'object' || msg === null) {
      msg = {};
    }
    const resolved = new KeyValue(null);
    if (msg.key !== undefined) {
      resolved.key = msg.key;
    }
    else {
      resolved.key = ''
    }

    if (msg.value !== undefined) {
      resolved.value = msg.value;
    }
    else {
      resolved.value = ''
    }

    return resolved;
    }
};

module.exports = KeyValue;
