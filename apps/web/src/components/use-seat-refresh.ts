import {
  getCalendarsListQueryKey,
  getOwnerLayoutGetQueryKey,
  getOccupancyListQueryKey,
  getOwnerSeatsListCubiclesQueryKey,
  getOwnerSeatsListSeatsQueryKey,
  getOwnerSpacesGetQueryKey,
  getOwnerSpacesListQueryKey,
} from '@bseat/api-client';
import { useQueryClient } from '@tanstack/react-query';

/** Refreshes everything a seat or cubicle change touches: both lists, the layout, the calendars, the space and the dashboard counts. */
export function useSeatRefresh(spaceId: string) {
  const queryClient = useQueryClient();
  return () => {
    for (const queryKey of [
      getOwnerSeatsListSeatsQueryKey(spaceId),
      getOwnerSeatsListCubiclesQueryKey(spaceId),
      getOccupancyListQueryKey(spaceId),
      getOwnerLayoutGetQueryKey(spaceId),
      getCalendarsListQueryKey(spaceId),
      getOwnerSpacesGetQueryKey(spaceId),
      getOwnerSpacesListQueryKey(),
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
}
