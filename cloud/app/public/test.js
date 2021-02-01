class Health extends HTMLElement {
  constructor() {
    // Always call super first in constructor
    super();

    // Create a shadow root
    const shadow = this.attachShadow({mode: 'open'});

    const wrapper = document.createElement('div');
    wrapper.setAttribute('class','wrapper');
    wrapper.innerHTML = 'health here';

    const style = document.createElement('style');
    style.textContent = '.wrapper { background-color: red; }';

    shadow.append(style,wrapper);
  }
}

customElements.define('rap-health', Health);
