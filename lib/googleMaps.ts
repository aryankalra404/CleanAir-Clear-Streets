export type GoogleMapSize = unknown;
export type GoogleMapPoint = unknown;

export interface GoogleMapLatLng {
  lat: () => number;
  lng: () => number;
}

export interface GoogleMapMarker {
  addListener: (eventName: string, handler: () => void) => void;
  getPosition?: () => GoogleMapLatLng | undefined;
  setAnimation: (animation: unknown) => void;
  setMap: (map: GoogleMapInstance | null) => void;
  setPosition?: (position: { lat: number; lng: number }) => void;
}

export interface GoogleMapCircle {
  setMap: (map: GoogleMapInstance | null) => void;
}

export interface GoogleMapInstance {
  panTo: (position: { lat: number; lng: number }) => void;
  setCenter?: (position: { lat: number; lng: number }) => void;
  setZoom?: (zoom: number) => void;
}

export interface GoogleMapInfoWindow {
  open: (options: { anchor?: GoogleMapMarker; map: GoogleMapInstance }) => void;
  setContent: (content: string) => void;
}

export interface GoogleMapGeocoderResult {
  formatted_address?: string;
  name?: string;
}

export interface GoogleMapGeocoder {
  geocode: (
    request: Record<string, unknown>,
    callback: (
      results: GoogleMapGeocoderResult[] | null,
      status: string,
    ) => void,
  ) => void;
}

export interface GooglePlaceResult {
  formatted_address?: string;
  geometry?: {
    location?: GoogleMapLatLng;
  };
  name?: string;
}

export interface GooglePlaceAutocomplete {
  addListener: (eventName: string, handler: () => void) => void;
  getPlace: () => GooglePlaceResult;
}

export interface GoogleMapsApi {
  maps: {
    Animation: {
      BOUNCE: unknown;
    };
    Circle: new (options: Record<string, unknown>) => GoogleMapCircle;
    ControlPosition: {
      RIGHT_BOTTOM: unknown;
      TOP_RIGHT: unknown;
    };
    event: {
      clearInstanceListeners: (instance: unknown) => void;
    };
    Geocoder: new () => GoogleMapGeocoder;
    InfoWindow: new () => GoogleMapInfoWindow;
    Map: new (node: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
    Marker: new (options: Record<string, unknown>) => GoogleMapMarker;
    Point: new (x: number, y: number) => GoogleMapPoint;
    places?: {
      Autocomplete: new (
        input: HTMLInputElement,
        options: Record<string, unknown>,
      ) => GooglePlaceAutocomplete;
    };
    Size: new (width: number, height: number) => GoogleMapSize;
    importLibrary?: (name: string) => Promise<unknown>;
  };
}

type GoogleMapsWindow = Window & {
  cleanAirGoogleMapsPromises?: Partial<Record<string, Promise<void>>>;
  google?: GoogleMapsApi;
};

function getGoogleMapsWindow() {
  return window as GoogleMapsWindow;
}

export function getGoogleMaps() {
  return getGoogleMapsWindow().google;
}

export function loadGoogleMaps(apiKey: string, options: { places?: boolean } = {}) {
  const mapsWindow = getGoogleMapsWindow();
  const needsPlaces = options.places ?? false;
  if (mapsWindow.google?.maps && (!needsPlaces || mapsWindow.google.maps.places)) {
    return Promise.resolve();
  }
  if (mapsWindow.google?.maps?.importLibrary && needsPlaces) {
    return mapsWindow.google.maps.importLibrary("places").then(() => undefined);
  }

  const promiseKey = needsPlaces ? "places" : "core";
  mapsWindow.cleanAirGoogleMapsPromises ??= {};
  if (mapsWindow.cleanAirGoogleMapsPromises[promiseKey]) {
    return mapsWindow.cleanAirGoogleMapsPromises[promiseKey];
  }

  mapsWindow.cleanAirGoogleMapsPromises[promiseKey] = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: apiKey,
      v: "weekly",
    });
    if (needsPlaces) params.set("libraries", "places");
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load."));
    document.head.appendChild(script);
  });

  return mapsWindow.cleanAirGoogleMapsPromises[promiseKey];
}
