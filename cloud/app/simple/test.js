// import './test.css';
// const css = require("./test.css").toString();

class Health extends HTMLElement {
  constructor() {
    // Always call super first in constructor
    super();

    // Create a shadow root
    const shadow = this.attachShadow({mode: 'open'});

    const wrapper = document.createElement('div');
    wrapper.setAttribute('class','wrapper');
    wrapper.innerHTML = '<div class="ui button">test: this should be blue</div>';

    // const style = document.createElement('style');
    // style.textContent = '.wrapper { background-color: red; }';
    // shadow.append(style, wrapper);

    shadow.append(wrapper);
    // console.log(css);
    // shadow.append(css, wrapper);


    this.webSocket = new WebSocket('ws://localhost2:9000');
    this.webSocket.onopen = (event) => {
      this.webSocket.send("Hi from client");
    };
  }
}

customElements.define('rap-health2', Health);
