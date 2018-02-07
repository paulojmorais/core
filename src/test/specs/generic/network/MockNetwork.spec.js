const { URL } = require('url');

class MockWebSocket extends Observable {

    /**
     * @constructor
     * @param {string} address
     * @returns {MockWebSocket}
     */
    constructor(address) {
        super();
        /** @type {string} */
        this._localAddress = address;
        /** @type {WebSocket.ReadyState} */
        this._readyState = WebSocket.CONNECTING;
    }

    /** @type {WebSocket.ReadyState} */
    get readyState() {
        return this._readyState;
    }

    /** @type {string} */
    get localAddress() {
        return this._localAddress;
    }

    /**
     * @param {MockWebSocket} channel
     * @returns {void}
     */
    link(channel) {
        this._socket = { remoteAddress: channel.localAddress };
        this.send = (msg) => setTimeout(() => channel.fire('message', msg), 0);
        this.close = () => channel.fire('close');
        this._readyState = WebSocket.OPEN;
    }
}

class MockWebSocketServer extends Observable {

    /**
     * @constructor
     * @param {string} address
     * @returns {MockWebSocketServer}
     */
    constructor(address) {
        super();
        /** @type {MockWebSocket} */
        this._mockWebSocket = new MockWebSocket(address);
    }

    /** @type {MockWebSocket} */
    get mockWebSocket() {
        return this._mockWebSocket;
    }
}

class MockNetwork {
    /**
     * @static
     * @param {MockWebSocketServer} server
     * @param {MockWebSocket} client
     * @returns {void}
     */
    static link(server, client) {
        server.mockWebSocket.link(client);
        client.link(server.mockWebSocket);

        setTimeout(function () {
            server.fire('connection', server.mockWebSocket);
            client.onopen();
        }, 0);
    }

    /**
     * @static
     * @returns {void}
     */
    static install() {
        spyOn(WebSocketFactory, 'newWebSocketServer').and.callFake(function (netconfig) {
            const peerAddress = netconfig.peerAddress;
            const server = new MockWebSocketServer(peerAddress.host);
            MockNetwork._servers.set(`wss://${peerAddress.host}:${peerAddress.port}`, server);
            return server;
        });

        spyOn(WebSocketFactory, 'newWebSocket').and.callFake(function (urlString) {
            const url = new URL(urlString);

            const client = new MockWebSocket(url.hostname);
            const server = MockNetwork._servers.get(urlString);

            MockNetwork.link(server, client);
            return client;
        });
    }

    /**
     * @static
     * @returns {void}
     */
    static uninstall() {
        WebSocketFactory.newWebSocketServer.and.callThrough();
        WebSocketFactory.newWebSocket.and.callThrough();
    }
}
/**
 * @type {Map<string, MockWebSocketServer>}
 * @private
 */
MockNetwork._servers = new Map();
Class.register(MockNetwork);
