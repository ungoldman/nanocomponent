const document = require('global/document')
const morph = require('nanomorph')
const onload = require('on-load')
const assert = require('assert')

const OL_KEY_ID = onload.KEY_ID
const OL_ATTR_ID = onload.KEY_ATTR

function makeID () {
  return 'ncid-' + Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1)
}

class Nanocomponent {
  constructor () {
    this._hasWindow = typeof window !== 'undefined'
    this._id = null // represents the id of the root node
    this._ncID = null // internal nanocomponent id
    this._olID = null
    this._proxy = null
    this._loaded = false // Used to debounce on-load when child-reordering
    this._rootNodeName = null
    this._rerender = false

    this._handleLoad = this._handleLoad.bind(this)
    this._handleUnload = this._handleUnload.bind(this)

    this._arguments = []
  }

  // public methods

  createElement () {
    throw new Error('nanocomponent: createElement should be implemented!')
  }

  update () {
    return true
  }

  render () {
    const self = this
    const args = new Array(arguments.length)
    let el

    for (let i = 0; i < arguments.length; i++) {
      args[i] = arguments[i]
    }

    if (!this._hasWindow) {
      el = this.createElement.apply(this, args)
      return el
    }

    if (this.element) {
      el = this.element // retain reference, as the ID might change on render

      const shouldUpdate = this._rerender || this.update.apply(this, args)

      if (this._rerender) {
        this._rerender = false
      }

      if (shouldUpdate) {
        const desiredHtml = this._handleRender(args)

        morph(el, desiredHtml)

        if (this.afterupdate) this.afterupdate(el)
      }

      if (!this._proxy) {
        this._proxy = this._createProxy()
      }

      return this._proxy
    }

    this._reset()

    el = this._handleRender(args)

    if (this.beforerender) this.beforerender(el)
    if (this.load || this.unload || this.afterreorder) {
      onload(el, self._handleLoad, self._handleUnload, self._ncID)
      this._olID = el.dataset[OL_KEY_ID]
    }

    return el
  }

  rerender () {
    assert(this.element, 'nanocomponent: cant rerender on an unmounted dom node')

    this._rerender = true
    this.render.apply(this, this._arguments)
  }

  // getters

  get element () {
    const el = document.getElementById(this._id)

    if (el) {
      return el.dataset.nanocomponent === this._ncID ? el : undefined
    }
  }

  // private methods

  _handleRender (args) {
    const el = this.createElement.apply(this, args)

    if (!this._rootNodeName) {
      this._rootNodeName = el.nodeName
    }

    assert(el instanceof window.Element, 'nanocomponent: createElement should return a single DOM node')
    assert(this._rootNodeName === el.nodeName, 'nanocomponent: root node types cannot differ between re-renders')

    this._arguments = args

    return this._brandNode(this._ensureID(el))
  }

  _createProxy () {
    const proxy = document.createElement(this._rootNodeName)
    const self = this

    this._brandNode(proxy)

    proxy.id = this._id
    proxy.setAttribute('data-proxy', '')
    proxy.isSameNode = function (el) {
      return el && el.dataset.nanocomponent === self._ncID
    }

    return proxy
  }

  _reset () {
    this._ncID = makeID()
    this._olID = null
    this._id = null
    this._proxy = null
    this._rootNodeName = null
  }

  _brandNode (node) {
    node.setAttribute('data-nanocomponent', this._ncID)

    if (this._olID) {
      node.setAttribute(OL_ATTR_ID, this._olID)
    }

    return node
  }

  _ensureID (node) {
    if (node.id) {
      this._id = node.id
    } else {
      node.id = this._id = this._ncID
    }

    // Update proxy node ID if it changed
    if (this._proxy && this._proxy.id !== this._id) {
      this._proxy.id = this._id
    }

    return node
  }

  _handleLoad (el) {
    if (this._loaded) {
      if (this.afterreorder) this.afterreorder(el)
      return // Debounce child-reorders
    }

    this._loaded = true

    if (this.load) this.load(el)
  }

  _handleUnload (el) {
    if (this.element) return // Debounce child-reorders

    this._loaded = false

    if (this.unload) this.unload(el)
  }
}

module.exports = Nanocomponent
