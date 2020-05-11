import * as ActionCreators from '../../core/action-creators';
import { Transport } from './transport';

/**
 * ApiGateway
 *
 * Transport interface that interacts with the Master via APIGW
 */
export class ApiGatewayTransport extends Transport {
  /**
   * Creates a new Mutiplayer instance.
   * @param {object} socket - Override for unit tests.
   * @param {string} gameID - The game ID to connect to.
   * @param {string} playerID - The player ID associated with this client.
   * @param {string} gameName - The game type (the `name` field in `Game`).
   * @param {string} numPlayers - The number of players.
   * @param {string} server - The game server in the form of 'hostname:port'. Defaults to the server serving the client if not provided.
   */
  constructor({
    socket,
    store,
    gameID,
    playerID,
    gameName,
    numPlayers,
    server,
  } = {}) {
    super({ store, gameName, playerID, gameID, numPlayers });

    this.server = server;
    this.socket = socket;
    this.isConnected = false;
    this.callback = () => {};
    this.gameMetadataCallback = () => {};
  }

  /**
   * Called when an action that has to be relayed to the
   * game master is made.
   */
  onAction(state, action) {
    this.socket.send(
      JSON.stringify({
        type: 'update',
        action,
        gameName: this.gameName,
        state: state._stateID,
        gameID: this.gameID,
        playerID: this.playerID,
      })
    );
  }

  // Called when another player makes a move and the
  // master broadcasts the update to other clients (including
  // this one).
  onUpdate(gameID, state, deltalog) {
    const currentState = this.store.getState();

    if (gameID == this.gameID && state._stateID >= currentState._stateID) {
      const action = ActionCreators.update(state, deltalog);
      this.store.dispatch(action);
    }
  }

  // Called when the client first connects to the master
  // and requests the current game state.
  onSync(gameID, syncInfo) {
    if (gameID == this.gameID) {
      const action = ActionCreators.sync(syncInfo);
      this.gameMetadataCallback(syncInfo.filteredMetadata);
      this.store.dispatch(action);
    }
  }

  /**
   * Connect to the server.
   */
  connect() {
    if (!this.socket) {
      if (this.server) {
        let server = this.server;
        this.socket = new WebSocket(server);
      }
    }

    this.onMessage = event => {
      const parsed = JSON.parse(event.data);
      if (parsed.type === 'update') {
        this.onUpdate(...parsed.data);
      } else if (parsed.type === 'sync') {
        this.onSync(...parsed.data);
      } else {
        console.error('Not handling', parsed);
      }
    };

    this.onOpen = () => {
      this.isConnected = true;
      // this.callback();

      // Initial sync to get game state.
      this.socket.send(
        JSON.stringify({
          type: 'sync',
          gameName: this.gameName,
          gameID: this.gameID,
          playerID: this.playerID,
          numPlayers: this.numPlayers,
        })
      );
    };

    this.socket.addEventListener('message', this.onMessage.bind(this));

    this.socket.addEventListener('open', this.onOpen.bind(this));

    this.socket.addEventListener('close', function() {
      this.isConnected = false;
      // this.callback();
    });
  }

  /**
   * Disconnect from the server.
   */
  disconnect() {
    this.socket.close();
    this.socket = null;
    this.isConnected = false;
    this.callback();
  }

  /**
   * Subscribe to connection state changes.
   */
  subscribe(fn) {
    this.callback = fn;
  }

  subscribeGameMetadata(fn) {
    this.gameMetadataCallback = fn;
  }

  /**
   * Updates the game id.
   * @param {string} id - The new game id.
   */
  updateGameID(id) {
    this.gameID = id;

    const action = ActionCreators.reset(null);
    this.store.dispatch(action);

    if (this.socket) {
      this.socket.send(
        JSON.stringify({
          type: 'sync',
          gameName: this.gameName,
          gameID: this.gameID,
          playerID: this.playerID,
          numPlayers: this.numPlayers,
        })
      );
    }
  }

  /**
   * Updates the player associated with this client.
   * @param {string} id - The new player id.
   */
  updatePlayerID(id) {
    this.playerID = id;

    const action = ActionCreators.reset(null);
    this.store.dispatch(action);

    if (this.socket) {
      this.socket.send(
        JSON.stringify({
          type: 'sync',
          gameName: this.gameName,
          gameID: this.gameID,
          playerID: this.playerID,
          numPlayers: this.numPlayers,
        })
      );
    }
  }
}

export function ApiGateway({ server } = {}) {
  return transportOpts =>
    new ApiGatewayTransport({
      server,
      ...transportOpts,
    });
}
