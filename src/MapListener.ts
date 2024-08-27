import { EventEmitter } from "node:events";

export class MapListener<KeyType = string> extends Map<KeyType, EventEmitter> {
  private listenersMap = new Map<KeyType, (...args: unknown[]) => void>();

  set(key: KeyType, value: EventEmitter) {
    this.setListener(key, value);
    super.set(key, value);
    return this;
  }

  delete(key: KeyType) {
    this.deleteListener(key);
    return super.delete(key);
  }

  clear() {
    super.forEach((value, key) => {
      this.deleteListener(key, value);
    });
    super.clear();
  }

  private deleteListener(key: KeyType, superValue?: EventEmitter) {
    const handler = this.listenersMap.get(key);
    const value = superValue || super.get(key);
    if (handler && value) {
      value.removeListener("close", handler);
    }
    this.listenersMap.delete(key);
  }

  private setListener(key: KeyType, eventEmitter: EventEmitter) {
    // always try remove listener before since you can overwrite key value pair with Map.set
    this.deleteListener(key);

    const handler = () => this.delete(key);
    eventEmitter.once("close", handler);
    this.listenersMap.set(key, handler);
  }
}
