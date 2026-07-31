import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { FakePeer, FakeConn } = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void

  class FakeEmitter {
    handlers: Record<string, Handler[]> = {}
    on(ev: string, fn: Handler) {
      (this.handlers[ev] ??= []).push(fn)
      return this
    }
    emit(ev: string, ...args: unknown[]) {
      for (const fn of this.handlers[ev] ?? []) fn(...args)
    }
  }

  class FakeConn extends FakeEmitter {
    peer = 'node-1'
    open = false
    send = vi.fn()
    close = vi.fn()
  }

  class FakePeer extends FakeEmitter {
    static instances: FakePeer[] = []
    open = false
    destroyed = false
    lastConn: FakeConn | null = null
    destroy = vi.fn(() => { this.destroyed = true })
    connect = vi.fn(() => {
      const conn = new FakeConn()
      this.lastConn = conn
      return conn
    })
    constructor() {
      super()
      FakePeer.instances.push(this)
    }
  }

  return { FakePeer, FakeConn }
})

vi.mock('peerjs', () => ({ default: FakePeer }))

import { hostSwarm, joinSwarm } from './swarmNetwork'

beforeEach(() => {
  vi.useFakeTimers()
  FakePeer.instances.length = 0
})

afterEach(() => vi.useRealTimers())

describe('hostSwarm', () => {
  it('drops a node whose connection errors without closing (#62)', () => {
    const onLeft = vi.fn()
    const handle = hostSwarm('room1', vi.fn(), onLeft, vi.fn(), vi.fn())
    const peer = FakePeer.instances[0]

    const conn = new FakeConn()
    peer.emit('connection', conn)
    expect(handle.connections.size).toBe(1)

    conn.emit('error', new Error('ICE failed'))
    expect(handle.connections.size).toBe(0)
    expect(onLeft).toHaveBeenCalledWith('node-1')

    // a late close for the same peer must not double-fire onNodeLeft
    conn.emit('close')
    expect(onLeft).toHaveBeenCalledTimes(1)
  })

  it('reports an error if the broker connection never opens (#82)', () => {
    const onError = vi.fn()
    hostSwarm('room1', vi.fn(), vi.fn(), vi.fn(), onError)

    vi.advanceTimersByTime(20_000)
    expect(onError).toHaveBeenCalledOnce()
    expect(String(onError.mock.calls[0][0])).toMatch(/timed out/i)
  })

  it('does not fire the watchdog once the peer opens or after close (#82)', () => {
    const onError = vi.fn()
    const handle = hostSwarm('room1', vi.fn(), vi.fn(), vi.fn(), onError)
    const peer = FakePeer.instances[0]

    peer.open = true
    peer.emit('open')
    vi.advanceTimersByTime(20_000)
    expect(onError).not.toHaveBeenCalled()

    handle.close()
  })
})

describe('joinSwarm', () => {
  it('reports an error if the connection to the host never opens (#82)', () => {
    const onError = vi.fn()
    joinSwarm('room1', vi.fn(), vi.fn(), vi.fn(), onError)
    const peer = FakePeer.instances[0]

    peer.open = true
    peer.emit('open') // broker ok, but the data connection never opens
    vi.advanceTimersByTime(20_000)

    expect(onError).toHaveBeenCalledOnce()
    expect(String(onError.mock.calls[0][0])).toMatch(/timed out/i)
  })

  it('does not fire the watchdog when the connection opens (#82)', () => {
    const onOpen = vi.fn()
    const onError = vi.fn()
    joinSwarm('room1', onOpen, vi.fn(), vi.fn(), onError)
    const peer = FakePeer.instances[0]

    peer.open = true
    peer.emit('open')
    const conn = peer.lastConn!
    conn.open = true
    conn.emit('open')
    vi.advanceTimersByTime(20_000)

    expect(onOpen).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
  })

  it('does not fire the watchdog after leaving (#82)', () => {
    const onError = vi.fn()
    const handle = joinSwarm('room1', vi.fn(), vi.fn(), vi.fn(), onError)

    handle.close()
    vi.advanceTimersByTime(20_000)
    expect(onError).not.toHaveBeenCalled()
  })
})
