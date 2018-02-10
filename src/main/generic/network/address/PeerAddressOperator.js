// TODO Limit the number of addresses we store.
class PeerAddressOperator extends Observable {
    /**
     * @constructor
     * @param {NetworkConfig} networkConfig
     * @param {PeerAddressBook} addressBook
     */
    constructor(networkConfig, addressBook) {
        super();

         /**
         * @type {NetworkConfig}
         * @private
         */
        this._networkConfig = networkConfig;

        /**
         * List services for peer addresses
         * @type {PeerAddressBook}
         * @private
         */
        this._addressBook = addressBook;

        // Init seed peers.
        this.add(/*channel*/ null, PeerAddressOperator.SEED_PEERS);

        // Setup housekeeping interval.
        setInterval(() => this._housekeeping(), PeerAddressOperator.HOUSEKEEPING_INTERVAL);
    }

    /**
     * @returns {PeerAddressBook}
     */
    get addressBook() {
        return this._addressBook;
    }

    /**
     * @param {PeerChannel} channel
     * @param {PeerAddress|Array.<PeerAddress>} arg
     */
    add(channel, arg) {
        const peerAddresses = Array.isArray(arg) ? arg : [arg];
        const newAddresses = [];

        for (const addr of peerAddresses) {
            if (this._add(channel, addr)) {
                newAddresses.push(addr);
            }
        }

        // Tell listeners that we learned new addresses.
        if (newAddresses.length) {
            this.fire('added', newAddresses, this);
        }
    }

    /**
     * @param {PeerChannel} channel
     * @param {PeerAddress|RtcPeerAddress} peerAddress
     * @returns {boolean}
     * @private
     */
    _add(channel, peerAddress) {
        // Ignore our own address.
        if (this._networkConfig.peerAddress.equals(peerAddress)) {
            return false;
        }

        // Ignore address if it is too old.
        // Special case: allow seed addresses (timestamp == 0) via null channel.
        if (channel && peerAddress.exceedsAge()) {
            Log.d(PeerAddressOperator, `Ignoring address ${peerAddress} - too old (${new Date(peerAddress.timestamp)})`);
            return false;
        }

        // Ignore address if its timestamp is too far in the future.
        if (peerAddress.timestamp > Date.now() + PeerAddressOperator.MAX_TIMESTAMP_DRIFT) {
            Log.d(PeerAddressOperator, `Ignoring addresses ${peerAddress} - timestamp in the future`);
            return false;
        }

        // Increment distance values of RTC addresses.
        if (peerAddress.protocol === Protocol.RTC) {
            peerAddress.distance++;

            // Ignore address if it exceeds max distance.
            if (peerAddress.distance > PeerAddressOperator.MAX_DISTANCE) {
                Log.d(PeerAddressOperator, `Ignoring address ${peerAddress} - max distance exceeded`);
                // Drop any route to this peer over the current channel. This may prevent loops.
                const peerAddressState = this._addressBook.get(peerAddress);
                if (peerAddressState) {
                    peerAddressState.deleteRoute(channel);
                }
                return false;
            }
        }

        // Check if we already know this address.
        let peerAddressState = this._addressBook.get(peerAddress);
        if (peerAddressState) {
            const knownAddress = peerAddressState.peerAddress;

            // Ignore address if it is banned.
            if (peerAddressState.state === PeerAddressState.BANNED) {
                return false;
            }

            // Never update seed peers.
            if (knownAddress.isSeed()) {
                return false;
            }

            // Never erase NetAddresses.
            if (knownAddress.netAddress && !peerAddress.netAddress) {
                peerAddress.netAddress = knownAddress.netAddress;
            }

            // Ignore address if it is a websocket address and we already know this address with a more recent timestamp.
            if (peerAddress.protocol === Protocol.WS && knownAddress.timestamp >= peerAddress.timestamp) {
                return false;
            }
        } else {
            // Add new peerAddressState.
            peerAddressState = new PeerAddressState(peerAddress);
            this._addressBook.add(peerAddressState);
            if (peerAddress.protocol === Protocol.RTC) {
                // Index by peerId.
                this._addressBook.putPeerId(peerAddress.peerId, peerAddressState);
            }
        }

        // Add route.
        if (peerAddress.protocol === Protocol.RTC) {
            peerAddressState.addRoute(channel, peerAddress.distance, peerAddress.timestamp);
        }

        // Update the address.
        peerAddressState.peerAddress = peerAddress;

        return true;
    }

    /**
     * Called when a connection to this peerAddress is being established.
     * @param {PeerAddress} peerAddress
     * @returns {void}
     */
    connecting(peerAddress) {
        this._transition(peerAddress, this.connecting);
    }

    /**
     * Called when a connection to this peerAddress has been established.
     * The connection might have been initiated by the other peer, so address
     * may not be known previously.
     * If it is already known, it has been updated by a previous version message.
     * @param {PeerChannel} channel
     * @param {PeerAddress|RtcPeerAddress} peerAddress
     * @returns {void}
     */
    connected(channel, peerAddress) {
        this._transition(peerAddress, this.connected, {channel});
    }

    /**
     * Called when a connection to this peerAddress is closed.
     * @param {PeerChannel} channel
     * @param {PeerAddress} peerAddress
     * @param {boolean} closedByRemote
     * @returns {void}
     */
    disconnected(channel, peerAddress, closedByRemote) {
        this._transition(peerAddress, this.disconnected, {channel, closedByRemote});
    }

    /**
     * Called when a network connection to this peerAddress has failed.
     * @param {PeerAddress} peerAddress
     * @returns {void}
     */
    failure(peerAddress) {
        this._transition(peerAddress, this.failure);
    }

    /**
     * Called when a message has been returned as unroutable.
     * @param {PeerChannel} channel
     * @param {PeerAddress} peerAddress
     * @returns {void}
     */
    unroutable(channel, peerAddress) {
        this._transition(peerAddress, this.unroutable, {channel});
    }

    /**
     * @param {PeerAddress} peerAddress
     * @param {number} [duration] in milliseconds
     * @returns {void}
     */
    ban(peerAddress, duration = PeerAddressOperator.DEFAULT_BAN_TIME) {
        this._transition(peerAddress, this.ban, {duration});
    }

    /**
     * @param {PeerAddress} peerAddress
     * @returns {boolean}
     */
    isConnected(peerAddress) {
        const peerAddressState = this._addressBook.get(peerAddress);
        return peerAddressState && peerAddressState.state === PeerAddressState.CONNECTED;
    }

    /**
     * @param {PeerAddress} peerAddress
     * @returns {boolean}
     */
    isBanned(peerAddress) {
        const peerAddressState = this._addressBook.get(peerAddress);
        return peerAddressState
            && peerAddressState.state === PeerAddressState.BANNED
            // XXX Never consider seed peers to be banned. This allows us to use
            // the banning mechanism to prevent seed peers from being picked when
            // they are down, but still allows recovering seed peers' inbound
            // connections to succeed.
            && !peerAddressState.peerAddress.isSeed();
    }

    /**
     * @param {PeerAddress} peerAddress
     * @returns {void}
     * @private
     */
    _remove(peerAddress) {
        const peerAddressState = this._addressBook.get(peerAddress);
        if (!peerAddressState) {
            return;
        }

        // Never delete seed addresses, ban them instead for a couple of minutes.
        if (peerAddressState.peerAddress.isSeed()) {
            this.ban(peerAddress, peerAddressState.banBackoff);
            return;
        }

        // Delete from peerId index.
        if (peerAddress.protocol === Protocol.RTC) {
            this._addressBook.removePeerId(peerAddress.peerId);
        }

        if (peerAddressState.state === PeerAddressState.CONNECTING) {
            this._addressBook.connectingCount--;
        }

        // Don't delete bans.
        if (peerAddressState.state === PeerAddressState.BANNED) {
            return;
        }

        // Delete the address.
        this._addressBook.remove(peerAddress);
    }

    /**
     * Delete all RTC-only routes that are signalable over the given peer.
     * @param {PeerChannel} channel
     * @returns {void}
     * @private
     */
    _removeBySignalChannel(channel) {
        // XXX inefficient linear scan
        for (const peerAddressState of this._addressBook.values()) {
            if (peerAddressState.peerAddress.protocol === Protocol.RTC) {
                peerAddressState.deleteRoute(channel);
                if (!peerAddressState.hasRoute()) {
                    this._remove(peerAddressState.peerAddress);
                }
            }
        }
    }


    /**
     * @returns {void}
     * @private
     */
    _housekeeping() {
        const now = Date.now();
        const unbannedAddresses = [];

        for (/** @type {PeerAddressState} */ const peerAddressState of this._addressBook.values()) {
            const addr = peerAddressState.peerAddress;

            switch (peerAddressState.state) {
                case PeerAddressState.NEW:
                case PeerAddressState.TRIED:
                case PeerAddressState.FAILED:
                    // Delete all new peer addresses that are older than MAX_AGE.
                    if (addr.exceedsAge()) {
                        Log.d(PeerAddressOperator, `Deleting old peer address ${addr}`);
                        this._remove(addr);
                    }

                    // Reset failed attempts after bannedUntil has expired.
                    if (peerAddressState.state === PeerAddressState.FAILED
                        && peerAddressState.failedAttempts >= peerAddressState.maxFailedAttempts
                        && peerAddressState.bannedUntil > 0 && peerAddressState.bannedUntil <= now) {

                        peerAddressState.bannedUntil = -1;
                        peerAddressState.failedAttempts = 0;
                    }
                    
                    break;

                case PeerAddressState.BANNED:
                    if (peerAddressState.bannedUntil <= now) {
                        // If we banned because of failed attempts or it is a seed node, try again.
                        if (peerAddressState.failedAttempts >= peerAddressState.maxFailedAttempts || addr.isSeed()) {
                            // Restore banned seed addresses to the NEW state.
                            peerAddressState.state = PeerAddressState.NEW;
                            peerAddressState.failedAttempts = 0;
                            peerAddressState.bannedUntil = -1;
                            unbannedAddresses.push(addr);
                        } else {
                            // Delete expires bans.
                            this._addressBook.store.remove(addr);
                        }
                    }
                    break;

                case PeerAddressState.CONNECTED:
                    // Also update timestamp for RTC connections
                    if (peerAddressState.bestRoute) {
                        peerAddressState.bestRoute.timestamp = now;
                    }
                    break;

                default:
                    // TODO What about peers who are stuck connecting? Can this happen?
                    // Do nothing for CONNECTING peers.
            }
        }

        if (unbannedAddresses.length) {
            this.fire('added', unbannedAddresses, this);
        }
    }

    /**
     * @param {PeerAddress} peerAddress
     * @param {function} caller
     * @param {Object} payload
     * @returns {PeerAddressState|null}
     */
    _transition(peerAddress, caller, payload={}) {
        // Request caller function (does not work in strict mode)
        // const caller = this._transition.caller;
    
        // Shortcut on empty peerAddress
        if ([PeerAddressOperator.unroutable].includes(caller)) {
            if (!peerAddress) {
                return null;
            }
        }

        let peerAddressState = this._addressBook.get(peerAddress);

        // Handling the absence of a peerAddressState
        if ([PeerAddressOperator.prototype.connecting,
            PeerAddressOperator.prototype.disconnected,
            PeerAddressOperator.prototype.failure,
            PeerAddressOperator.prototype.unroutable].includes(caller)) {
            if (!peerAddressState) {
                return null;
            }
        }
        else if (PeerAddressOperator.prototype.connected === caller) {
            if (!peerAddressState) {
                peerAddressState = new PeerAddressState(peerAddress);
    
                if (peerAddress.protocol === Protocol.RTC) {
                    this._addressBook.putPeerId(peerAddress.peerId, peerAddressState);
                }
    
                this._addressBook.add(peerAddressState);
            }    
        }
        else if (PeerAddressOperator.prototype.ban == caller) {
            if (!peerAddressState) {
                peerAddressState = new PeerAddressState(peerAddress);
                this._addressBook.add(peerAddressState);
            }    
        }
 
        // Disconnect channel
        if ([PeerAddressOperator.prototype.disconnected].includes(caller)) {
            if (payload.channel) {
                this._removeBySignalChannel(payload.channel);
            }
        }

        // Reduce the state
        peerAddressState = peerAddressState.reduce(caller, this._addressBook);
        if (!peerAddressState){
            return null;
        }

        // Individual additional behaviour
        if ([PeerAddressOperator.prototype.connected].includes(caller)) {
            peerAddressState.lastConnected = Date.now();
            peerAddressState.failedAttempts = 0;
            peerAddressState.banBackoff = PeerAddressOperator.INITIAL_FAILED_BACKOFF;

            peerAddressState.peerAddress = peerAddress;

            // Add route.
            if (peerAddress.protocol === Protocol.RTC) {
                peerAddressState.addRoute(payload.channel, peerAddress.distance, peerAddress.timestamp);
            }
        }

        if ([PeerAddressOperator.prototype.failure].includes(caller)) {
            peerAddressState.failedAttempts++;

            if (peerAddressState.failedAttempts >= peerAddressState.maxFailedAttempts) {
                // Remove address only if we have tried the maximum number of backoffs.
                if (peerAddressState.banBackoff >= PeerAddressOperator.MAX_FAILED_BACKOFF) {
                    this._remove(peerAddress);
                } else {
                    peerAddressState.bannedUntil = Date.now() + peerAddressState.banBackoff;
                    peerAddressState.banBackoff = Math.min(PeerAddressOperator.MAX_FAILED_BACKOFF, peerAddressState.banBackoff * 2);
                }
            }
        }

        if ([PeerAddressOperator.prototype.ban].includes(caller)) {
            peerAddressState.bannedUntil = Date.now() + payload.duration ? payload.duration : 0;

            // Drop all routes to this peer.
            peerAddressState.deleteAllRoutes();
        }

        if ([PeerAddressOperator.prototype.disconnected].includes(caller)) {
            // XXX Immediately delete address if the remote host closed the connection.
            // Also immediately delete dumb clients, since we cannot connect to those anyway.
            if ((payload.closedByRemote && PlatformUtils.isOnline()) || peerAddressState.peerAddress.protocol === Protocol.DUMB) {
                this._remove(peerAddress);
            }
        }

        if ([PeerAddressOperator.prototype.unroutable].includes(caller)) {
            if (!peerAddressState.bestRoute || (payload.channel && !peerAddressState.bestRoute.signalChannel.equals(payload.channel))) {
                Log.w(PeerAddressOperator, `Got unroutable for ${peerAddress} on a channel other than the best route.`);
                return null;
            }
    
            peerAddressState.deleteBestRoute();
            if (!peerAddressState.hasRoute()) {
                this._remove(peerAddressState.peerAddress);
            }
        }

        return peerAddressState;
    }
}
PeerAddressOperator.MAX_AGE_WEBSOCKET = 1000 * 60 * 30; // 30 minutes
PeerAddressOperator.MAX_AGE_WEBRTC = 1000 * 60 * 10; // 10 minutes
PeerAddressOperator.MAX_AGE_DUMB = 1000 * 60; // 1 minute
PeerAddressOperator.MAX_DISTANCE = 4;
PeerAddressOperator.MAX_FAILED_ATTEMPTS_WS = 3;
PeerAddressOperator.MAX_FAILED_ATTEMPTS_RTC = 2;
PeerAddressOperator.MAX_TIMESTAMP_DRIFT = 1000 * 60 * 10; // 10 minutes
PeerAddressOperator.HOUSEKEEPING_INTERVAL = 1000 * 60; // 1 minute
PeerAddressOperator.DEFAULT_BAN_TIME = 1000 * 60 * 10; // 10 minutes
PeerAddressOperator.INITIAL_FAILED_BACKOFF = 1000 * 15; // 15 seconds
PeerAddressOperator.MAX_FAILED_BACKOFF = 1000 * 60 * 10; // 10 minutes
PeerAddressOperator.SEED_PEERS = [
    // WsPeerAddress.seed('alpacash.com', 8080),
    // WsPeerAddress.seed('nimiq1.styp-rekowsky.de', 8080),
    // WsPeerAddress.seed('nimiq2.styp-rekowsky.de', 8080),
    // WsPeerAddress.seed('seed1.nimiq-network.com', 8080),
    // WsPeerAddress.seed('seed2.nimiq-network.com', 8080),
    // WsPeerAddress.seed('seed3.nimiq-network.com', 8080),
    // WsPeerAddress.seed('seed4.nimiq-network.com', 8080),
    // WsPeerAddress.seed('emily.nimiq-network.com', 443)
    WsPeerAddress.seed('dev.nimiq-network.com', 8080)
];
Class.register(PeerAddressOperator);
