class PeerAddressList {
    /**
     * @constructor
     */
    constructor() {
        /**
         * Set of PeerAddressStates of all peerAddresses we know.
         * @type {HashMap.<PeerAddress, PeerAddressState>}
         * @private
         */
        this._store = new HashMap();

        /**
         * Map from signalIds to RTC peerAddresses.
         * @type {HashMap.<SignalId,PeerAddressState>}
         * @private
         */
        this._signalIds = new HashMap();

        // Number of WebSocket/WebRTC peers.
        /** @type {number} */
        this._peerCountWs = 0;
        /** @type {number} */
        this._peerCountRtc = 0;
        /** @type {number} */
        this._peerCountDumb = 0;

        /**
         * Number of ongoing outbound connection attempts.
         * @type {number}
         * @private
         */
        this._connectingCount = 0;
    }

    /**
     * @param {PeerAddress} peerAddress
     * @returns {PeerAddress|null}
     */
    get(peerAddress) {
        /** @type {PeerAddressState} */
        return this._store.get(peerAddress);
    }

    /**
     * @param {PeerAddress} peerAddress
     * @returns {PeerAddress|null}
     */
    getPeerAddress(peerAddress) {
        /** @type {PeerAddressState} */
        const peerAddressState = this._store.get(peerAddress);
        return peerAddressState ? peerAddressState.peerAddress : null;
    }

    /**
     * @param {PeerAddressState} peerAddressState
     */
    add(peerAddressState) {
        this._store.put(peerAddressState.peerAddress, peerAddressState);
    }

    /**
     * @param {PeerAddress} peerAddress
     */
    remove(peerAddress) {
        this._store.remove(peerAddress);
    }

    /**
     * @returns {PeerAddress|null}
     */
    values() {
        return this._store.values();
    }

     /**
     * @param {SignalId} signalId
     * @param {PeerAddressState} peerAddressState
     */
    putSignalId(peerAddressState) {
        this._signalIds.put(signalId, peerAddressState);
    }

    /**
     * @param {SignalId} signalId
     */
    removeSignalId(signalId) {
        this._signalIds.remove(signalId);
    }

    /**
     * @param {SignalId} signalId
     * @returns {PeerAddress|null}
     */
    getBySignalId(signalId) {
        /** @type {PeerAddressState} */
        const peerAddressState = this._signalIds.get(signalId);
        return peerAddressState ? peerAddressState.peerAddress : null;
    }

    /**
     * @param {SignalId} signalId
     * @returns {PeerChannel}
     */
    getChannelBySignalId(signalId) {
        const peerAddressState = this._signalIds.get(signalId);
        if (peerAddressState && peerAddressState.bestRoute) {
            return peerAddressState.bestRoute.signalChannel;
        }
        return null;
    }

    /**
     * @param {PeerAddress} peerAddress
     * @param {number} delta
     * @returns {void}
     */
    updateConnectedPeerCount(peerAddress, delta) {
        switch (peerAddress.protocol) {
            case Protocol.WS:
                this._peerCountWs += delta;
                break;
            case Protocol.RTC:
                this._peerCountRtc += delta;
                break;
            case Protocol.DUMB:
                this._peerCountDumb += delta;
                break;
            default:
                Log.w(PeerAddressList, `Unknown protocol ${peerAddress.protocol}`);
        }
    }

    /** @type {number} */
    get peerCountWs() {
        return this._peerCountWs;
    }

    /** @type {number} */
    get peerCountRtc() {
        return this._peerCountRtc;
    }

    /** @type {number} */
    get peerCountDumb() {
        return this._peerCountDumb;
    }

    /** @type {number} */
    get peerCount() {
        return this._peerCountWs + this._peerCountRtc + this._peerCountDumb;
    }

    /** @type {number} */
    get connectingCount() {
        return this._connectingCount;
    }

    /** @param {number} */
    set connectingCount(value) {
        this._connectingCount = value;
    }
}
Class.register(PeerAddressList);
