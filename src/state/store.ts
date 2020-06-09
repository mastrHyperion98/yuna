import { ipcRenderer, shell } from 'electron'
import Vue from 'vue'
import Vuex from 'vuex'

import { Anilist } from '@/lib/anilist'
import {
  ANILIST_LOGIN,
  FFMPEG_DOWNLOADED,
  FFMPEG_FAILED,
  UPDATE_AVAILABLE,
} from '@/messages'

import { app, AppState, sendToast, setIsUpdateAvailable } from './app'
import { auth, AuthState } from './auth'
import { setFfmpegFailed, settings, SettingsState } from './settings'
import { user, UserState } from './user'
import { router } from '@/router'

Vue.use(Vuex)

const modules = { app, auth, user, settings }

ipcRenderer.on(UPDATE_AVAILABLE, (_, downloadUrl) => {
  setIsUpdateAvailable(store, downloadUrl)

  sendToast(store, {
    type: 'info',
    title: 'A new update is available!',
    message: 'Click here to download it.',
    timeout: 15 * 1000,
    click: () => shell.openExternal(downloadUrl),
  })
})

type Parameters = {
  token: string
  expires: number
}

ipcRenderer.on(ANILIST_LOGIN, async (_: any, params: Parameters) => {
  await Anilist.updateUserData(store, params)
})

export type RootState = {
  app: AppState
  auth: AuthState
  user: UserState
  settings: SettingsState
}

export const store = new Vuex.Store<RootState>({
  modules,
  strict: process.env.NODE_ENV !== 'production',
})

ipcRenderer.on(FFMPEG_FAILED, () => {
  setFfmpegFailed(store, true)

  sendToast(store, {
    type: 'error',
    title: 'Could not download FFMPEG.',
    message: 'Local file support will not work.',
    click: () => router.push('/settings#ffmpeg'),
  })
})

ipcRenderer.on(FFMPEG_DOWNLOADED, () => {
  setFfmpegFailed(store, false)

  sendToast(store, {
    type: 'success',
    title: 'Successfully downloaded FFMPEG!',
    message: 'Local file support will work now!',
  })
})
