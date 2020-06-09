import { DollarApollo } from 'vue-apollo/types/vue-apollo'
import { captureException } from '@sentry/browser'

import ANIME_PAGE_QUERY from '@/views/anime/anime.graphql'
import {
  AddToListMutation,
  AddToListVariables,
  AnimeViewQuery,
  AnimeViewQueryVariables,
  DeleteFromListMutation,
  DeleteFromListVariables,
  EditListEntryMutation,
  EditListEntryMutationVariables,
  ListEntry,
  MediaListStatus,
  Provider,
  StartRewatchingMutation,
  StartRewatchingVariables,
  UpdateProgressMutation,
  UpdateProgressVariables,
  UpdateScoreMutation,
  UpdateScoreVariables,
  UpdateStatusMutation,
  UpdateStatusVariables,
} from '@/graphql/generated/types'
import {
  ADD_TO_LIST,
  DELETE_FROM_LIST,
  EDIT_LIST_ENTRY,
  START_REWATCHING,
  UPDATE_PROGRESS,
  UPDATE_SCORE,
  UPDATE_STATUS,
} from '@/graphql/documents/mutations'
import {
  addToCacheList,
  EpisodeMutationObject,
  removeFromCacheList,
  writeEpisodeProgressToCache,
} from '@/utils/cache'
import { Instance } from '@/types'
import { ListEntryWithoutMedia } from '@/plugins/list/plugin'

const getOptimisticResponse = (
  apollo: DollarApollo<any>,
  anilistId: number,
  newValues: Partial<Omit<ListEntry, '__typename' | 'mediaId'>>,
): ListEntryWithoutMedia => {
  const entry = (apollo.provider.defaultClient.cache as any).data.data[
    `ListEntry:${anilistId}`
  ] as ListEntry | undefined

  return {
    __typename: 'ListEntry',
    id: entry?.id ?? -1,
    mediaId: anilistId,
    score: entry?.score ?? -1,
    progress: entry?.progress ?? -1,
    rewatched: entry?.rewatched ?? -1,
    status: entry?.status ?? MediaListStatus.Planning,
    ...newValues,
  }
}

export const addToList = async ({ $apollo }: Instance, anilistId: number) =>
  $apollo.mutate<AddToListMutation>({
    mutation: ADD_TO_LIST,
    variables: { anilistId } as AddToListVariables,
    update: (cache, { data }) => {
      if (!data) return

      addToCacheList(cache, data.AddToList)

      const variables: AnimeViewQueryVariables = { id: anilistId }
      const cachedData = cache.readQuery<AnimeViewQuery>({
        query: ANIME_PAGE_QUERY,
        variables,
      })

      cachedData!.anime!.listEntry = data.AddToList

      cache.writeQuery({
        query: ANIME_PAGE_QUERY,
        variables,
        data: cachedData,
      })
    },
  })

export const deleteFromList = async (
  { $apollo }: Instance,
  anilistId: number,
) => {
  return $apollo.mutate<DeleteFromListMutation>({
    mutation: DELETE_FROM_LIST,
    variables: { anilistId } as DeleteFromListVariables,
    update: cache => {
      removeFromCacheList(cache, anilistId)

      const variables: AnimeViewQueryVariables = { id: anilistId }
      let data

      try {
        data = cache.readQuery<AnimeViewQuery>({
          query: ANIME_PAGE_QUERY,
          variables,
        })
      } catch (e) {
        /* no op */
      }

      if (!data || !data.anime || !data.anime.listEntry) return

      data.anime.listEntry = null

      cache.writeQuery({
        query: ANIME_PAGE_QUERY,
        variables,
        data,
      })
    },
  })
}

export const editListEntry = async (
  { $apollo }: Instance,
  anilistId: number,
  options: EditListEntryMutationVariables['options'],
) => {
  const oldStatus = getOptimisticResponse($apollo, anilistId, {}).status
  const variables: EditListEntryMutationVariables = {
    anilistId,
    options,
  }

  return $apollo.mutate<EditListEntryMutation>({
    mutation: EDIT_LIST_ENTRY,
    variables,
    errorPolicy: 'all',
    update: (proxy, { data }) => {
      if (!data || options.status === oldStatus) return data

      removeFromCacheList(proxy, anilistId)
      addToCacheList(proxy, data.EditListEntry)

      return data
    },
  })
}

export const updateStatus = async (
  { $apollo }: Instance,
  anilistId: number,
  status: MediaListStatus,
) => {
  return $apollo.mutate<UpdateStatusMutation>({
    mutation: UPDATE_STATUS,
    variables: { anilistId, status } as UpdateStatusVariables,
    optimisticResponse: {
      UpdateStatus: getOptimisticResponse($apollo, anilistId, {
        status,
      }),
    },
    update: (proxy, { data }) => {
      removeFromCacheList(proxy, anilistId)
      addToCacheList(proxy, data!.UpdateStatus)
    },
  })
}

export const startRewatching = async (
  { $apollo }: Instance,
  anilistId: number,
) => {
  await $apollo.mutate<StartRewatchingMutation>({
    mutation: START_REWATCHING,
    variables: { anilistId } as StartRewatchingVariables,
    optimisticResponse: {
      StartRewatching: getOptimisticResponse($apollo, anilistId, {
        status: MediaListStatus.Repeating,
        progress: 0,
      }),
    },
    update: (cache, { data }) => {
      if (!data) return

      addToCacheList(cache, data.StartRewatching)

      const fakeEpisode: EpisodeMutationObject = {
        provider: Provider.Crunchyroll,
        animeId: data.StartRewatching!.mediaId,
        episodeNumber: 0,
      }
      writeEpisodeProgressToCache(cache, fakeEpisode)
    },
  })
}

export const updateScore = async (
  { $apollo }: Instance,
  anilistId: number,
  score: number,
) =>
  $apollo.mutate<UpdateScoreMutation>({
    mutation: UPDATE_SCORE,
    variables: { anilistId, score } as UpdateScoreVariables,
    optimisticResponse: {
      UpdateScore: getOptimisticResponse($apollo, anilistId, { score }),
    },
  })

export const setProgress = async (
  { $apollo }: Instance,
  options: EpisodeMutationObject,
) => {
  const progress = options.episodeNumber

  if (progress < 0) {
    return captureException(new Error('Tried to set progress to -1'))
  }

  const variables: UpdateProgressVariables = {
    anilistId: options.animeId,
    progress,
  }
  const oldStatus = getOptimisticResponse($apollo, options.animeId, {}).status

  return $apollo.mutate<UpdateProgressMutation>({
    mutation: UPDATE_PROGRESS,
    variables,
    optimisticResponse: {
      UpdateProgress: getOptimisticResponse($apollo, options.animeId, {
        progress,
      }),
    },
    update: (cache, { data }) => {
      if (!data) return

      if (oldStatus !== data.UpdateProgress.status) {
        removeFromCacheList(cache, options.animeId)
        addToCacheList(cache, data.UpdateProgress)
      }

      writeEpisodeProgressToCache(cache, options)
    },
  })
}
