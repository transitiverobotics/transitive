// Auto-generated. Do not edit!

// (in-package diagnostic_msgs.msg)


"use strict";

const _serializer = _ros_msg_utils.Serialize;
const _arraySerializer = _serializer.Array;
const _deserializer = _ros_msg_utils.Deserialize;
const _arrayDeserializer = _deserializer.Array;
const _finder = _ros_msg_utils.Find;
const _getByteLength = _ros_msg_utils.getByteLength;
let KeyValue = require('./KeyValue.js');

//-----------------------------------------------------------

class DiagnosticStatus {
  constructor(initObj={}) {
    if (initObj === null) {
      // initObj === null is a special case for deserialization where we don't initialize fields
      this.level = null;
      this.name = null;
      this.message = null;
      this.hardware_id = null;
      this.values = null;
    }
    else {
      if (initObj.hasOwnProperty('level')) {
        this.level = initObj.level
      }
      else {
        this.level = 0;
      }
      if (initObj.hasOwnProperty('name')) {
        this.name = initObj.name
      }
      else {
        this.name = '';
      }
      if (initObj.hasOwnProperty('message')) {
        this.message = initObj.message
      }
      else {
        this.message = '';
      }
      if (initObj.hasOwnProperty('hardware_id')) {
        this.hardware_id = initObj.hardware_id
      }
      else {
        this.hardware_id = '';
      }
      if (initObj.hasOwnProperty('values')) {
        this.values = initObj.values
      }
      else {
        this.values = [];
      }
    }
  }

  static serialize(obj, buffer, bufferOffset) {
    // Serializes a message object of type DiagnosticStatus
    // Serialize message field [level]
    bufferOffset = _serializer.byte(obj.level, buffer, bufferOffset);
    // Serialize message field [name]
    bufferOffset = _serializer.string(obj.name, buffer, bufferOffset);
    // Serialize message field [message]
    bufferOffset = _serializer.string(obj.message, buffer, bufferOffset);
    // Serialize message field [hardware_id]
    bufferOffset = _serializer.string(obj.hardware_id, buffer, bufferOffset);
    // Serialize message field [values]
    // Serialize the length for message field [values]
    bufferOffset = _serializer.uint32(obj.values.length, buffer, bufferOffset);
    obj.values.forEach((val) => {
      bufferOffset = KeyValue.serialize(val, buffer, bufferOffset);
    });
    return bufferOffset;
  }

  static deserialize(buffer, bufferOffset=[0]) {
    //deserializes a message object of type DiagnosticStatus
    let len;
    let data = new DiagnosticStatus(null);
    // Deserialize message field [level]
    data.level = _deserializer.byte(buffer, bufferOffset);
    // Deserialize message field [name]
    data.name = _deserializer.string(buffer, bufferOffset);
    // Deserialize message field [message]
    data.message = _deserializer.string(buffer, bufferOffset);
    // Deserialize message field [hardware_id]
    data.hardware_id = _deserializer.string(buffer, bufferOffset);
    // Deserialize message field [values]
    // Deserialize array length for message field [values]
    len = _deserializer.uint32(buffer, bufferOffset);
    data.values = new Array(len);
    for (let i = 0; i < len; ++i) {
      data.values[i] = KeyValue.deserialize(buffer, bufferOffset)
    }
    return data;
  }

  static getMessageSize(object) {
    let length = 0;
    length += object.name.length;
    length += object.message.length;
    length += object.hardware_id.length;
    object.values.forEach((val) => {
      length += KeyValue.getMessageSize(val);
    });
    return length + 17;
  }

  static datatype() {
    // Returns string type for a message object
    return 'diagnostic_msgs/DiagnosticStatus';
  }

  static md5sum() {
    //Returns md5sum for a message object
    return 'd0ce08bc6e5ba34c7754f563a9cabaf1';
  }

  static messageDefinition() {
    // Returns full string definition for message
    return `
    # This message holds the status of an individual component of the robot.
    # 
    
    # Possible levels of operations
    byte OK=0
    byte WARN=1
    byte ERROR=2
    byte STALE=3
    
    byte level # level of operation enumerated above 
    string name # a description of the test/component reporting
    string message # a description of the status
    string hardware_id # a hardware unique string
    KeyValue[] values # an array of values associated with the status
    
    
    ================================================================================
    MSG: diagnostic_msgs/KeyValue
    string key # what to label this value when viewing
    string value # a value to track over time
    
    `;
  }

  static Resolve(msg) {
    // deep-construct a valid message object instance of whatever was passed in
    if (typeof msg !== 'object' || msg === null) {
      msg = {};
    }
    const resolved = new DiagnosticStatus(null);
    if (msg.level !== undefined) {
      resolved.level = msg.level;
    }
    else {
      resolved.level = 0
    }

    if (msg.name !== undefined) {
      resolved.name = msg.name;
    }
    else {
      resolved.name = ''
    }

    if (msg.message !== undefined) {
      resolved.message = msg.message;
    }
    else {
      resolved.message = ''
    }

    if (msg.hardware_id !== undefined) {
      resolved.hardware_id = msg.hardware_id;
    }
    else {
      resolved.hardware_id = ''
    }

    if (msg.values !== undefined) {
      resolved.values = new Array(msg.values.length);
      for (let i = 0; i < resolved.values.length; ++i) {
        resolved.values[i] = KeyValue.Resolve(msg.values[i]);
      }
    }
    else {
      resolved.values = []
    }

    return resolved;
    }
};

// Constants for message
DiagnosticStatus.Constants = {
  OK: 0,
  WARN: 1,
  ERROR: 2,
  STALE: 3,
}

module.exports = DiagnosticStatus;
