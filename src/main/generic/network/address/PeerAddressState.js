class PeerAddressState {
    /**
     * @constructor
     * @param {PeerAddress} peerAddress
     */
    constructor(peerAddress, addressList) {
        /** @type {PeerAddress} */
        this.peerAddress = peerAddress;

        /** @type {number} */
        this.state = PeerAddressState.NEW;
        /** @type {number} */
        this.lastConnected = -1;
        /** @type {number} */
        this.bannedUntil = -1;
        /** @type {number} */
        this.banBackoff = PeerAddressOperator.INITIAL_FAILED_BACKOFF;

        /** @type {SignalRoute} */
        this._bestRoute = null;
        /** @type {HashSet.<SignalRoute>} */
        this._routes = new HashSet();

        /** @type {number} */
        this._failedAttempts = 0;
    }

    /** @type {number} */
    get maxFailedAttempts() {
        switch (this.peerAddress.protocol) {
            case Protocol.RTC:
                return PeerAddressOperator.MAX_FAILED_ATTEMPTS_RTC;
            case Protocol.WS:
                return PeerAddressOperator.MAX_FAILED_ATTEMPTS_WS;
            default:
                return 0;
        }
    }

    /** @type {number} */
    get failedAttempts() {
        if (this._bestRoute) {
            return this._bestRoute.failedAttempts;
        } else {
            return this._failedAttempts;
        }
    }

    /** @type {number} */
    set failedAttempts(value) {
        if (this._bestRoute) {
            this._bestRoute.failedAttempts = value;
            this._updateBestRoute(); // scores may have changed
        } else {
            this._failedAttempts = value;
        }
    }

    /** @type {SignalRoute} */
    get bestRoute() {
        return this._bestRoute;
    }

    /**
     * @param {PeerChannel} signalChannel
     * @param {number} distance
     * @param {number} timestamp
     * @returns {void}
     */
    addRoute(signalChannel, distance, timestamp) {
        const oldRoute = this._routes.get(signalChannel);
        const newRoute = new SignalRoute(signalChannel, distance, timestamp);

        if (oldRoute) {
            // Do not reset failed attempts.
            newRoute.failedAttempts = oldRoute.failedAttempts;
        }
        this._routes.add(newRoute);

        if (!this._bestRoute || newRoute.score > this._bestRoute.score
            || (newRoute.score === this._bestRoute.score && timestamp > this._bestRoute.timestamp)) {

            this._bestRoute = newRoute;
            this.peerAddress.distance = this._bestRoute.distance;
        }
    }

    /**
     * @returns {void}
     */
    deleteBestRoute() {
        if (this._bestRoute) {
            this.deleteRoute(this._bestRoute.signalChannel);
        }
    }

    /**
     * @param {PeerChannel} signalChannel
     * @returns {void}
     */
    deleteRoute(signalChannel) {
        this._routes.remove(signalChannel); // maps to same hashCode
        if (this._bestRoute && this._bestRoute.signalChannel.equals(signalChannel)) {
            this._updateBestRoute();
        }
    }

    /**
     * @returns {void}
     */
    deleteAllRoutes() {
        this._bestRoute = null;
        this._routes = new HashSet();
    }

    /**
     * @returns {boolean}
     */
    hasRoute() {
        return this._routes.length > 0;
    }


    /**
     * @returns {boolean}
     */
    isQueryable() {
        // Never return banned or failed addresses.
        if (this.state === PeerAddressState.BANNED || this.state === PeerAddressState.FAILED) {
            return false;
        }

        // Never return seed peers.
        const address = this.peerAddress;
        if (address.isSeed()) {
            return false;
        }

        // Only return addresses matching the protocol mask.
        if ((address.protocol & protocolMask) === 0) {
            return false;
        }

        // Only return addresses matching the service mask.
        if ((address.services & serviceMask) === 0) {
            return false;
        }
        return true;   
    }

    /**
     * @param {number} time
     * @returns {void}
     */
    updateTimestamp(time) {
        if (this.state === PeerAddressState.CONNECTED) {
            address.timestamp = time;
            // Also update timestamp for RTC connections
            if (this.bestRoute) {
                this.bestRoute.timestamp = time;
            }
        }
    }

    /**
     * @param {function} caller
     * @param {PeerAddressBook} addressList
     * @returns {PeerAddressState|null}
     */
    reduce(caller, addressList) {
        // Break or exceptions on current state BANNED or CONNECTED
        if (this.state === PeerAddressState.BANNED) {
            if ([PeerAddressOperator.prototype.connecting,
                PeerAddressOperator.prototype.disconnected,
                PeerAddressOperator.prototype.failure].includes(caller)) {
                return null;
            }

            if ([PeerAddressOperator.prototype.connecting].includes(caller)) {
                throw 'Connecting to banned address';
            }

            if ([PeerAddressOperator.prototype.connected].includes(caller)) {
                // Allow recovering seed peer's inbound connection to succeed.
                if (!this.peerAddress.isSeed()) {
                    throw 'Connected to banned address';
                }
            }
        }

        if ([PeerAddressOperator.prototype.connecting].includes(caller)) {
            if (this.state === PeerAddressState.CONNECTED) {
                throw `Duplicate connection to ${this.peerAddress}`;
            }
        }

        // Control addresslist's connectingCount
        if ([PeerAddressOperator.prototype.connecting].includes(caller)) {
            if (this.state !== PeerAddressState.CONNECTING) {
                addressList.connectingCount++;
            }
        }

        if ([PeerAddressOperator.prototype.connected,
            PeerAddressOperator.prototype.disconnected,
            PeerAddressOperator.prototype.failure,
            PeerAddressOperator.prototype.ban].includes(caller)) {
            if (this.state === PeerAddressState.CONNECTING) {
                addressList.connectingCount--;
            }
        }

        // Control addresslist's connected counts
        if ([PeerAddressOperator.prototype.connected].includes(caller)) {
            if (this.state !== PeerAddressState.CONNECTED) {
                addressList.updateConnectedPeerCount(this.peerAddress, 1);
            }
        }

        if ([PeerAddressOperator.prototype.disconnected,
            PeerAddressOperator.prototype.ban].includes(caller)) {
            if (this.state === PeerAddressState.CONNECTED) {
                addressList.updateConnectedPeerCount(this.peerAddress, -1);
            }
        }

        // Set state
        if ([PeerAddressOperator.prototype.connecting,
            PeerAddressOperator.prototype.connected,
            PeerAddressOperator.prototype.disconnected,
            PeerAddressOperator.prototype.failure,
            PeerAddressOperator.prototype.ban].includes(caller)) {
            let nextState;
            switch (caller) {
                case PeerAddressOperator.prototype.connecting:
                    nextState = PeerAddressState.CONNECTING;
                    break;
                case PeerAddressOperator.prototype.connected:
                    nextState = PeerAddressState.CONNECTED;
                    break;
                case PeerAddressOperator.prototype.disconnected:
                    nextState = PeerAddressState.TRIED;
                    break;
                case PeerAddressOperator.prototype.failure:
                    nextState = PeerAddressState.FAILED;
                    break;
                case PeerAddressOperator.prototype.ban:
                    nextState = PeerAddressState.BANNED;
                    break;
        
                default:
                    nextState = this.state;
                    break;
            }

            this.state = nextState;           
        }

        return this;
    }

    /**
     * @returns {void}
     * @private
     */
    _updateBestRoute() {
        let bestRoute = null;
        // Choose the route with minimal distance and maximal timestamp.
        for (const route of this._routes.values()) {
            if (bestRoute === null || route.score > bestRoute.score
                || (route.score === bestRoute.score && route.timestamp > bestRoute.timestamp)) {

                bestRoute = route;
            }
        }
        this._bestRoute = bestRoute;
        if (this._bestRoute) {
            this.peerAddress.distance = this._bestRoute.distance;
        } else {
            this.peerAddress.distance = PeerAddressOperator.MAX_DISTANCE + 1;
        }
    }

    /**
     * @param {PeerAddressState|*} o
     * @returns {boolean}
     */
    equals(o) {
        return o instanceof PeerAddressState
            && this.peerAddress.equals(o.peerAddress);
    }

    /**
     * @returns {string}
     */
    hashCode() {
        return this.peerAddress.hashCode();
    }

    /**
     * @returns {string}
     */
    toString() {
        return `PeerAddressState{peerAddress=${this.peerAddress}, state=${this.state}, `
            + `lastConnected=${this.lastConnected}, failedAttempts=${this.failedAttempts}, `
            + `bannedUntil=${this.bannedUntil}}`;
    }
}
PeerAddressState.NEW = 1;
PeerAddressState.CONNECTING = 2;
PeerAddressState.CONNECTED = 3;
PeerAddressState.TRIED = 4;
PeerAddressState.FAILED = 5;
PeerAddressState.BANNED = 6;
Class.register(PeerAddressState);
