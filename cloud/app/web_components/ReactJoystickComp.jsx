import * as React from 'react';

const InteractionEvents = {
  MouseDown: "mousedown",
  MouseMove: "mousemove",
  MouseUp: "mouseup",
  TouchStart: "touchstart",
  TouchMove: "touchmove",
  TouchEnd: "touchend"
};

/** Modified version of
  https://www.npmjs.com/package/react-joystick-component

  Modifications:
  - accept style
  - send x/y on start event (not just on move); this allows tapping to move
*/
export class ReactJoystickComp extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      dragging: false
    };
    this.stickRef = React.createRef();
    this.baseRef = React.createRef();


    this.throttleMoveCallback = (() => {
        let lastCall = 0;
        return (event) => {

          const now = new Date().getTime();
          const throttleAmount = this.props.throttle || 0;
          if (now - lastCall < throttleAmount) {
            return;
          }
          lastCall = now;
          if (this.props.move) {
            return this.props.move(event);
          }
        };
      })();

    this.boundMouseUp = () => {
      this.mouseUp();
    };
    this.boundMouseMove = (event)  => {
      this.mouseMove(event);
    }
  }

  updatePos(coordinates) {
    window.requestAnimationFrame(() => {
      this.setState({
        coordinates
      });
    });
    this.throttleMoveCallback({
      type: "move",
      x: coordinates.relativeX,
      y: -coordinates.relativeY,
    });

  }

  mouseDown(e) {
    if(this.props.disabled !== true){
      this.parentRect = this.baseRef.current.getBoundingClientRect();

      this.setState({
        dragging: true
      });

      if(e.type === InteractionEvents.MouseDown){
        window.addEventListener(InteractionEvents.MouseUp, this.boundMouseUp);
        window.addEventListener(InteractionEvents.MouseMove, this.boundMouseMove);
      } else {
        window.addEventListener(InteractionEvents.TouchEnd, this.boundMouseUp);
        window.addEventListener(InteractionEvents.TouchMove, this.boundMouseMove);
      }

      const {x, y} = this.getRelativeXY(e);

      if (this.props.start) {
        this.props.start({
          type: "start",
          x,
          y: -y,
        });
      }

      this.setState({coordinates: {relativeX: x, relativeY: y}});
    }
  }

  getWithinBounds(value) {
    const halfBaseSize = this.baseSize / 2;
    if(value > halfBaseSize){
      return halfBaseSize;
    }
    if(value < -(halfBaseSize)){
      return halfBaseSize * -1;
    }
    return value
  }

  getRelativeXY(event) {
    let absoluteX = null;
    let absoluteY = null;
    if (event.type.startsWith('mouse')) {
      absoluteX = event.clientX;
      absoluteY = event.clientY;
    } else {
      absoluteX = event.touches[0].clientX;
      absoluteY = event.touches[0].clientY;
    }

    const x = this.getWithinBounds(absoluteX - this.parentRect.left - (this.baseSize / 2));
    const y = this.getWithinBounds(absoluteY - this.parentRect.top - (this.baseSize / 2));

    return {x, y};
  }

  mouseMove(event) {
    if (this.state.dragging) {
      const {x, y} = this.getRelativeXY(event);
      const atan2 = Math.atan2(x, y);

      this.updatePos({
        relativeX: x,
        relativeY: y,
      });
    }
  }

  mouseUp() {
    this.setState({
      dragging: false,
      coordinates: undefined
    });
    window.removeEventListener("mouseup", this.boundMouseUp);
    window.removeEventListener("mousemove", this.boundMouseMove);

    if (this.props.stop) {
      this.props.stop({
        type: "stop",
        x: null,
        y: null,
      });
    }
  }

  getBaseStyle() {
    const baseColor = this.props.baseColor !== undefined ? this.props.baseColor : "000033";

    const baseSizeString = `${this.baseSize}px`;
    return {
      height: baseSizeString,
      width: baseSizeString,
      background: baseColor,
      borderRadius: this.baseSize,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center'
    };
  }

  getStickStyle() {
    const stickColor = this.props.stickColor !== undefined ? this.props.stickColor : "3D59AB";
    const stickSize = `${this.baseSize / 1.5}px`;

    let stickStyle= {
      background: stickColor,
      cursor: "move",
      height: stickSize,
      width: stickSize,
      borderRadius: this.baseSize,
      flexShrink: 0
    };

    if (this.state.dragging && this.state.coordinates !== undefined) {
      stickStyle = Object.assign({}, stickStyle, {
        position: 'absolute',
        transform: `translate3d(${this.state.coordinates.relativeX}px, ${this.state.coordinates.relativeY}px, 0)`
      });
    }
    return stickStyle;
  }

  render() {
    this.baseSize = this.props.size || 100;
    const baseStyle = Object.assign({}, this.props.style, this.getBaseStyle());
    const stickStyle = this.getStickStyle();
    return (
      <div className={this.props.disabled ? 'joystick-base-disabled': ''}
        onMouseDown={this.mouseDown.bind(this)}
        onTouchStart={this.mouseDown.bind(this)}
        ref={this.baseRef}
        style={baseStyle}>
        <div ref={this.stickRef}
          className={this.props.disabled ? 'joystick-disabled': ''}
          style={stickStyle}></div>
      </div>
    )
  }
};
