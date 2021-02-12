// Auto-generated. Do not edit!

// (in-package diagnostic_msgs.msg)


"use strict";

const _serializer = _ros_msg_utils.Serialize;
const _arraySerializer = _serializer.Array;
const _deserializer = _ros_msg_utils.Deserialize;
const _arrayDeserializer = _deserializer.Array;
const _finder = _ros_msg_utils.Find;
const _getByteLength = _ros_msg_utils.getByteLength;
let DiagnosticStatus = require('./DiagnosticStatus.js');
let std_msgs = _finder('std_msgs');

//-----------------------------------------------------------

class DiagnosticArray {
  constructor(initObj={}) {
    if (initObj === null) {
      // initObj === null is a special case for deserialization where we don't initialize fields
      this.header = null;
      this.status = null;
    }
    else {
      if (initObj.hasOwnProperty('header')) {
        this.header = initObj.header
      }
      else {
        this.header = new std_msgs.msg.Header();
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
    // Serializes a message object of type DiagnosticArray
    // Serialize message field [header]
    bufferOffset = std_msgs.msg.Header.serialize(obj.header, buffer, bufferOffset);
    // Serialize message field [status]
    // Serialize the length for message field [status]
    bufferOffset = _serializer.uint32(obj.status.length, buffer, bufferOffset);
    obj.status.forEach((val) => {
      bufferOffset = DiagnosticStatus.serialize(val, buffer, bufferOffset);
    });
    return bufferOffset;
  }

  static deserialize(buffer, bufferOffset=[0]) {
    //deserializes a message object of type DiagnosticArray
    let len;
    let data = new DiagnosticArray(null);
    // Deserialize message field [header]
    data.header = std_msgs.msg.Header.deserialize(buffer, bufferOffset);
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
    length += std_msgs.msg.Header.getMessageSize(object.header);
    object.status.forEach((val) => {
      length += DiagnosticStatus.getMessageSize(val);
    });
    return length + 4;
  }

  static datatype() {
    // Returns string type for a message object
    return 'diagnostic_msgs/DiagnosticArray';
  }

  static md5sum() {
    //Returns md5sum for a message object
    return '60810da900de1dd6ddd437c3503511da';
  }

  static messageDefinition() {
    // Returns full string definition for message
    return `
    # This message is used to send diagnostic information about the state of the robot
    Header header #for timestamp
    DiagnosticStatus[] status # an array of components being reported on
    ================================================================================
    MSG: std_msgs/Header
    # Standard metadata for higher-level stamped data types.
    # This is generally used to communicate timestamped data 
    # in a particular coordinate frame.
    # 
    # sequence ID: consecutively increasing ID 
    uint32 seq
    #Two-integer timestamp that is expressed as:
    # * stamp.sec: seconds (stamp_secs) since epoch (in Python the variable is called 'secs')
    # * stamp.nsec: nanoseconds since stamp_secs (in Python the variable is called 'nsecs')
    # time-handling sugar is provided by the client library
    time stamp
    #Frame this data is associated with
    string frame_id
    
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
    const resolved = new DiagnosticArray(null);
    if (msg.header !== undefined) {
      resolved.header = std_msgs.msg.Header.Resolve(msg.header)
    }
    else {
      resolved.header = new std_msgs.msg.Header()
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

module.exports = DiagnosticArray;
