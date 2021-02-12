// Auto-generated. Do not edit!

// (in-package diagnostic_msgs.srv)


"use strict";

const _serializer = _ros_msg_utils.Serialize;
const _arraySerializer = _serializer.Array;
const _deserializer = _ros_msg_utils.Deserialize;
const _arrayDeserializer = _deserializer.Array;
const _finder = _ros_msg_utils.Find;
const _getByteLength = _ros_msg_utils.getByteLength;

//-----------------------------------------------------------

let DiagnosticStatus = require('../msg/DiagnosticStatus.js');

//-----------------------------------------------------------

class SelfTestRequest {
  constructor(initObj={}) {
    if (initObj === null) {
      // initObj === null is a special case for deserialization where we don't initialize fields
    }
    else {
    }
  }

  static serialize(obj, buffer, bufferOffset) {
    // Serializes a message object of type SelfTestRequest
    return bufferOffset;
  }

  static deserialize(buffer, bufferOffset=[0]) {
    //deserializes a message object of type SelfTestRequest
    let len;
    let data = new SelfTestRequest(null);
    return data;
  }

  static getMessageSize(object) {
    return 0;
  }

  static datatype() {
    // Returns string type for a service object
    return 'diagnostic_msgs/SelfTestRequest';
  }

  static md5sum() {
    //Returns md5sum for a message object
    return 'd41d8cd98f00b204e9800998ecf8427e';
  }

  static messageDefinition() {
    // Returns full string definition for message
    return `
    
    `;
  }

  static Resolve(msg) {
    // deep-construct a valid message object instance of whatever was passed in
    if (typeof msg !== 'object' || msg === null) {
      msg = {};
    }
    const resolved = new SelfTestRequest(null);
    return resolved;
    }
};

class SelfTestResponse {
  constructor(initObj={}) {
    if (initObj === null) {
      // initObj === null is a special case for deserialization where we don't initialize fields
      this.id = null;
      this.passed = null;
      this.status = null;
    }
    else {
      if (initObj.hasOwnProperty('id')) {
        this.id = initObj.id
      }
      else {
        this.id = '';
      }
      if (initObj.hasOwnProperty('passed')) {
        this.passed = initObj.passed
      }
      else {
        this.passed = 0;
      }
      if (initObj.hasOwnProperty('status')) {
        this.status = initObj.status
      }
      else {
        this.status = [];
      }
    }
  }

  static serialize(obj, buffer, bufferOffset) {
    // Serializes a message object of type SelfTestResponse
    // Serialize message field [id]
    bufferOffset = _serializer.string(obj.id, buffer, bufferOffset);
    // Serialize message field [passed]
    bufferOffset = _serializer.byte(obj.passed, buffer, bufferOffset);
    // Serialize message field [status]
    // Serialize the length for message field [status]
    bufferOffset = _serializer.uint32(obj.status.length, buffer, bufferOffset);
    obj.status.forEach((val) => {
      bufferOffset = DiagnosticStatus.serialize(val, buffer, bufferOffset);
    });
    return bufferOffset;
  }

  static deserialize(buffer, bufferOffset=[0]) {
    //deserializes a message object of type SelfTestResponse
    let len;
    let data = new SelfTestResponse(null);
    // Deserialize message field [id]
    data.id = _deserializer.string(buffer, bufferOffset);
    // Deserialize message field [passed]
    data.passed = _deserializer.byte(buffer, bufferOffset);
    // Deserialize message field [status]
    // Deserialize array length for message field [status]
    len = _deserializer.uint32(buffer, bufferOffset);
    data.status = new Array(len);
    for (let i = 0; i < len; ++i) {
      data.status[i] = DiagnosticStatus.deserialize(buffer, bufferOffset)
    }
    return data;
  }

  static getMessageSize(object) {
    let length = 0;
    length += object.id.length;
    object.status.forEach((val) => {
      length += DiagnosticStatus.getMessageSize(val);
    });
    return length + 9;
  }

  static datatype() {
    // Returns string type for a service object
    return 'diagnostic_msgs/SelfTestResponse';
  }

  static md5sum() {
    //Returns md5sum for a message object
    return 'ac21b1bab7ab17546986536c22eb34e9';
  }

  static messageDefinition() {
    // Returns full string definition for message
    return `
    string id
    byte passed
    DiagnosticStatus[] status
    
    
    ================================================================================
    MSG: diagnostic_msgs/DiagnosticStatus
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
    const resolved = new SelfTestResponse(null);
    if (msg.id !== undefined) {
      resolved.id = msg.id;
    }
    else {
      resolved.id = ''
    }

    if (msg.passed !== undefined) {
      resolved.passed = msg.passed;
    }
    else {
      resolved.passed = 0
    }

    if (msg.status !== undefined) {
      resolved.status = new Array(msg.status.length);
      for (let i = 0; i < resolved.status.length; ++i) {
        resolved.status[i] = DiagnosticStatus.Resolve(msg.status[i]);
      }
    }
    else {
      resolved.status = []
    }

    return resolved;
    }
};

module.exports = {
  Request: SelfTestRequest,
  Response: SelfTestResponse,
  md5sum() { return 'ac21b1bab7ab17546986536c22eb34e9'; },
  datatype() { return 'diagnostic_msgs/SelfTest'; }
};
