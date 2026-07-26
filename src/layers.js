/**
 * Layer catalogue, generated from the firepanel.ai `Wildfire` MMGIS mission
 * and then hand-adjusted. Regenerate with scripts/build_layers.mjs.
 *
 * `kind` decides how a layer is built:
 *   wmts     REST WMTS tiles, GIBS-style: host/layer/tms/ext and an optional date
 *   wms      GIBS WMS GetMap, used for the thermal-anomaly products
 *   pgstac   TiTiler-pgSTAC collection on a JPL host
 *   cog      Single COG per timestep, served by firepanel's veloserver
 *   velocity Gridded wind JSON for the particle layer
 *
 * `gated` marks a layer whose host does not answer from the public internet.
 * Those rows stay hidden until a startup probe proves otherwise, so an
 * off-network visitor sees a working map rather than a wall of broken tiles.
 */

export const BASEMAPS = [
  {
    id: 'esri-imagery',
    name: 'Esri World Imagery',
    meta: 'Sub-metre aerial and satellite mosaic',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
  },
  {
    id: 'carto-dark',
    name: 'Carto Dark Matter',
    meta: 'Muted basemap \u2014 keeps fire colours legible',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap contributors, &copy; CARTO',
  },
  {
    id: 'carto-light',
    name: 'Carto Positron',
    meta: 'Light terrain-style base',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap contributors, &copy; CARTO',
  },
  {
    id: 'aster-relief',
    name: 'ASTER Shaded Relief',
    meta: 'Colour shaded relief \u2014 terrain driving fire behaviour',
    url: 'https://gitc.earthdata.nasa.gov/wmts/epsg3857/best/ASTER_GDEM_Color_Shaded_Relief/default/GoogleMapsCompatible_Level12/{z}/{y}/{x}.jpeg',
    maxZoom: 12,
    attribution: 'NASA GIBS / ASTER GDEM',
  },
]

/** Place labels drawn above the data, replacing the reference site's Google layer. */
export const LABELS = {
  id: 'labels',
  name: 'Place labels',
  // Esri's reference layer is drawn for overlaying imagery — white type with a
  // dark halo — where Carto's label tiles are flat grey and vanish against a
  // satellite basemap, which is the default here.
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  maxZoom: 16,
  attribution: 'Labels &copy; Esri',
}

export const OVERLAYS = [
  {"id": "fires-and-thermal-anomalies-aqua-modis", "name": "Fires and Thermal Anomalies (Aqua / MODIS)", "group": "Fire Perimeters", "kind": "wms", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "url": "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?version=1.1.0&service=WMS&request=GetMap&format=image/png&crs=EPSG:3857&STYLE=default&time={time}&layers=MODIS_Aqua_Thermal_Anomalies_All", "wmsLayer": "MODIS_Aqua_Thermal_Anomalies_All"},
  {"id": "fires-and-thermal-anomalies-terra-modis", "name": "Fires and Thermal Anomalies (Terra / MODIS)", "group": "Fire Perimeters", "kind": "wms", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "url": "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?version=1.1.0&service=WMS&request=GetMap&format=image/png&crs=EPSG:3857&STYLE=default&time={time}&layers=MODIS_Terra_Thermal_Anomalies_All", "wmsLayer": "MODIS_Terra_Thermal_Anomalies_All"},
  {"id": "fires-and-thermal-anomalies-combined-aqua-terra-modi", "name": "Fires and Thermal Anomalies (Combined Aqua, Terra / MODIS)", "group": "Fire Perimeters", "kind": "wms", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "url": "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?version=1.1.0&service=WMS&request=GetMap&format=image/png&crs=EPSG:3857&STYLE=default&time={time}&layers=MODIS_Combined_Thermal_Anomalies_All", "wmsLayer": "MODIS_Combined_Thermal_Anomalies_All"},
  {"id": "fires-and-thermal-anomalies-suomi-npp-viirs", "name": "Fires and Thermal Anomalies (Suomi NPP / VIIRS)", "group": "Fire Perimeters", "kind": "wms", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "url": "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?version=1.1.0&service=WMS&request=GetMap&format=image/png&crs=EPSG:3857&STYLE=default&time={time}&layers=VIIRS_SNPP_Thermal_Anomalies_375m_All", "wmsLayer": "VIIRS_SNPP_Thermal_Anomalies_375m_All"},
  {"id": "fires-and-thermal-anomalies-noaa-20-viirs", "name": "Fires and Thermal Anomalies (NOAA-20 / VIIRS)", "group": "Fire Perimeters", "kind": "wms", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "url": "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?version=1.1.0&service=WMS&request=GetMap&format=image/png&crs=EPSG:3857&STYLE=default&time={time}&layers=VIIRS_NOAA20_Thermal_Anomalies_375m_All", "wmsLayer": "VIIRS_NOAA20_Thermal_Anomalies_375m_All"},
  {"id": "fires-and-thermal-anomalies-noaa-21-viirs", "name": "Fires and Thermal Anomalies (NOAA-21 / VIIRS)", "group": "Fire Perimeters", "kind": "wms", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "url": "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?version=1.1.0&service=WMS&request=GetMap&format=image/png&crs=EPSG:3857&STYLE=default&time={time}&layers=VIIRS_NOAA21_Thermal_Anomalies_375m_All", "wmsLayer": "VIIRS_NOAA21_Thermal_Anomalies_375m_All"},
  {"id": "predict-what-we-breathe-co", "name": "Predict What We Breathe CO", "group": "Forecasts", "kind": "pgstac", "time": true, "gated": true, "url": "https://ideas-digitaltwin.jpl.nasa.gov/mmgis/titilerpgstac/collections/pwwb_co"},
  {"id": "predict-what-we-breathe-no", "name": "Predict What We Breathe NO", "group": "Forecasts", "kind": "pgstac", "time": true, "gated": true, "url": "https://ideas-digitaltwin.jpl.nasa.gov/mmgis/titilerpgstac/collections/pwwb_no"},
  {"id": "predict-what-we-breathe-no2", "name": "Predict What We Breathe NO2", "group": "Forecasts", "kind": "pgstac", "time": true, "gated": true, "url": "https://ideas-digitaltwin.jpl.nasa.gov/mmgis/titilerpgstac/collections/pwwb_no2"},
  {"id": "predict-what-we-breathe-o3", "name": "Predict What We Breathe O3", "group": "Forecasts", "kind": "pgstac", "time": true, "gated": true, "url": "https://ideas-digitaltwin.jpl.nasa.gov/mmgis/titilerpgstac/collections/pwwb_o3"},
  {"id": "predict-what-we-breathe-pm-2-5-hourly", "name": "Predict What We Breathe PM 2.5 (hourly)", "group": "Forecasts", "kind": "pgstac", "time": true, "gated": true, "url": "https://ideas-digitaltwin.jpl.nasa.gov/mmgis/titilerpgstac/collections/pwwb_v2_pm25"},
  {"id": "predict-what-we-breathe-pm-2-5-daily", "name": "Predict What We Breathe PM 2.5 (daily)", "group": "Forecasts", "kind": "pgstac", "time": true, "gated": true, "url": "https://ideas-digitaltwin.jpl.nasa.gov/mmgis/titilerpgstac/collections/pwwb_pm25"},
  {"id": "fire-danger-from-earth-observations-fdeo-probability", "name": "Fire Danger from Earth Observations (FDEO) Probability", "group": "Forecasts", "kind": "pgstac", "time": true, "gated": true, "url": "https://ideas-digitaltwin.jpl.nasa.gov/mmgis/titilerpgstac/collections/fdeo_probability"},
  {"id": "fire-danger-from-earth-observations-fdeo-categorical", "name": "Fire Danger from Earth Observations (FDEO) Categorical", "group": "Forecasts", "kind": "pgstac", "time": true, "gated": true, "url": "https://ideas-digitaltwin.jpl.nasa.gov/mmgis/titilerpgstac/collections/fdeo_categorical"},
  {"id": "gfs-winds-10m-height", "name": "GFS Winds 10m height", "group": "Model", "kind": "velocity", "time": true, "gated": true, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "url": "https://firepanel.ai/veloserver/gfs/gribjson/{time}/"},
  {"id": "hrrr-winds-10m-height", "name": "HRRR Winds 10m height", "group": "Model", "kind": "velocity", "time": true, "gated": true, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "url": "https://firepanel.ai/veloserver/hrrr/gribjson/{time}/"},
  {"id": "hrrr-temperature-2m", "name": "HRRR Temperature 2m", "group": "Model", "kind": "cog", "time": true, "gated": true, "url": "COG:https://firepanel.ai/veloserver/cog/temp_2m/{time}.tiff"},
  {"id": "hrrr-smoke", "name": "HRRR Smoke", "group": "Model", "kind": "cog", "time": true, "gated": true, "url": "COG:https://firepanel.ai/veloserver/cog/smoke_massden/{time}.tiff"},
  {"id": "hrrr-relative-humidity-2m", "name": "HRRR Relative Humidity 2m", "group": "Model", "kind": "cog", "time": true, "gated": true, "url": "COG:https://firepanel.ai/veloserver/cog/rh_2m/{time}.tiff"},
  {"id": "hrrr-wind-gust", "name": "HRRR Wind Gust", "group": "Model", "kind": "cog", "time": true, "gated": true, "url": "COG:https://firepanel.ai/veloserver/cog/wind_gust/{time}.tiff"},
  {"id": "hrrr-dew-point-2m", "name": "HRRR Dew Point 2m", "group": "Model", "kind": "cog", "time": true, "gated": true, "url": "COG:https://firepanel.ai/veloserver/cog/dewpoint_2m/{time}.tiff"},
  {"id": "hrrr-pbl-height", "name": "HRRR PBL Height", "group": "Model", "kind": "cog", "time": true, "gated": true, "url": "COG:https://firepanel.ai/veloserver/cog/pbl_height/{time}.tiff"},
  {"id": "hrrr-wind-speed-10m", "name": "HRRR Wind Speed 10m", "group": "Model", "kind": "cog", "time": true, "gated": true, "url": "COG:https://firepanel.ai/veloserver/cog/winds/{time}.tiff"},
  {"id": "hrrr-wind-u-component-10m", "name": "HRRR Wind U Component 10m", "group": "Model", "kind": "cog", "time": true, "gated": true, "url": "COG:https://firepanel.ai/veloserver/cog/winds/{time}.tiff"},
  {"id": "hrrr-wind-v-component-10m", "name": "HRRR Wind V Component 10m", "group": "Model", "kind": "cog", "time": true, "gated": true, "url": "COG:https://firepanel.ai/veloserver/cog/winds/{time}.tiff"},
  {"id": "firesense-quicklook-transit", "name": "FireSense Quicklook Transit", "group": "FireSense", "kind": "pgstac", "time": true, "gated": true, "url": "https://popo.jpl.nasa.gov/mmgis-aviris/titilerpgstac/collections/av3_fireRGB_transit"},
  {"id": "firesense-quicklook", "name": "FireSense Quicklook", "group": "FireSense", "kind": "pgstac", "time": true, "gated": true, "url": "https://popo.jpl.nasa.gov/mmgis-aviris/titilerpgstac/collections/av3_fireRGB_science"},
  {"id": "smap-surface-soil-temperature", "name": "SMAP Surface Soil Temperature", "group": "SMAP", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "SMAP_L4_Soil_Temperature_Layer_1", "tms": "GoogleMapsCompatible_Level6", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/SMAP_Soil_Temperature_Layer_H.svg"},
  {"id": "smap-surface-soil-moisture", "name": "SMAP Surface Soil Moisture", "group": "SMAP", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "SMAP_L4_Analyzed_Surface_Soil_Moisture", "tms": "GoogleMapsCompatible_Level6", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/SMAP_Analyzed_Soil_Moisture_H.svg"},
  {"id": "smap-root-zone-soil-moisture", "name": "SMAP Root Zone Soil Moisture", "group": "SMAP", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "SMAP_L4_Analyzed_Root_Zone_Soil_Moisture", "tms": "GoogleMapsCompatible_Level6", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/SMAP_Analyzed_Soil_Moisture_H.svg"},
  {"id": "opera-vegetation-disturbance-status-color-index", "name": "OPERA Vegetation Disturbance Status (Color Index)", "group": "OPERA", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "OPERA_L3_DIST-ALERT-HLS_Color_Index", "tms": "GoogleMapsCompatible_Level12", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/OPERA_Vegetation_Disturbance_Status_H.svg"},
  {"id": "opera-vegetation-disturbance-status-annual-color-ind", "name": "OPERA Vegetation Disturbance Status (Annual, Color Index)", "group": "OPERA", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "OPERA_L3_DIST-ANN-HLS_Color_Index", "tms": "GoogleMapsCompatible_Level12", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/OPERA_Vegetation_Disturbance_Annual_H.svg"},
  {"id": "sentinel-5p-tropomi-carbon-monoxide", "name": "Sentinel-5P TROPOMI Carbon Monoxide", "group": "TROPOMI", "kind": "wmts", "time": true, "gated": true, "timeFormat": "%Y-%m-%d", "host": "https://ideas-digitaltwin.jpl.nasa.gov", "layer": "TROPOMI_global_carbonmonoxide_total_column", "tms": "GoogleMapsCompatible_Level6", "ext": "png"},
  {"id": "sentinel-5p-tropomi-methane", "name": "Sentinel-5P TROPOMI Methane", "group": "TROPOMI", "kind": "wmts", "time": true, "gated": true, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://ideas-digitaltwin.jpl.nasa.gov", "layer": "TROPOMI_global_methane_mixing_ratio", "tms": "GoogleMapsCompatible_Level6", "ext": "png"},
  {"id": "sentinel-5p-tropomi-sulphur-dioxide", "name": "Sentinel-5P TROPOMI Sulphur Dioxide", "group": "TROPOMI", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "TROPOMI_L2_Sulfur_Dioxide_Total_Vertical_Column", "tms": "GoogleMapsCompatible_Level6", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/OMI_SO2_Lower_Troposphere_H.svg"},
  {"id": "sentinel-5p-tropomi-total-ozone", "name": "Sentinel-5P TROPOMI Total Ozone", "group": "TROPOMI", "kind": "wmts", "time": true, "gated": true, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://ideas-digitaltwin.jpl.nasa.gov", "layer": "TROPOMI_global_ozone_total_vertical_column", "tms": "GoogleMapsCompatible_Level6", "ext": "png"},
  {"id": "sentinel-5p-tropomi-nitrogen-dioxide", "name": "Sentinel-5P TROPOMI Nitrogen Dioxide", "group": "TROPOMI", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "TROPOMI_L2_Nitrogen_Dioxide_Tropospheric_Column", "tms": "GoogleMapsCompatible_Level6", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/OMI_Nitrogen_Dioxide_Tropo_Column_H.svg"},
  {"id": "fire-temperature-abi-goes-east", "name": "Fire Temperature (ABI, GOES-East)", "group": "GOES", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "GOES-East_ABI_FireTemp", "tms": "GoogleMapsCompatible_Level7", "ext": "jpeg"},
  {"id": "fire-temperature-abi-goes-west", "name": "Fire Temperature (ABI, GOES-West)", "group": "GOES", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "GOES-West_ABI_FireTemp", "tms": "GoogleMapsCompatible_Level7", "ext": "jpeg"},
  {"id": "dust-abi-goes-west", "name": "Dust (ABI, GOES-West)", "group": "GOES", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "GOES-West_ABI_Dust", "tms": "GoogleMapsCompatible_Level7", "ext": "jpeg"},
  {"id": "dust-abi-goes-east", "name": "Dust (ABI, GOES-East)", "group": "GOES", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "GOES-East_ABI_Dust", "tms": "GoogleMapsCompatible_Level7", "ext": "jpeg"},
  {"id": "air-mass-abi-goes-west", "name": "Air Mass (ABI, GOES-West)", "group": "GOES", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "GOES-West_ABI_Air_Mass", "tms": "GoogleMapsCompatible_Level6", "ext": "jpeg"},
  {"id": "air-mass-abi-goes-east", "name": "Air Mass (ABI, GOES-East)", "group": "GOES", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "GOES-East_ABI_Air_Mass", "tms": "GoogleMapsCompatible_Level6", "ext": "jpeg"},
  {"id": "red-visible-0-64-m-band-2-abi-goes-west", "name": "Red Visible (0.64 µm, Band 2, ABI, GOES-West)", "group": "GOES", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "GOES-West_ABI_Band2_Red_Visible_1km", "tms": "GoogleMapsCompatible_Level7", "ext": "jpeg"},
  {"id": "red-visible-0-64-m-band-2-abi-goes-east", "name": "Red Visible (0.64 µm, Band 2, ABI, GOES-East)", "group": "GOES", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "GOES-East_ABI_Band2_Red_Visible_1km", "tms": "GoogleMapsCompatible_Level7", "ext": "jpeg"},
  {"id": "geo-color-abi-goes-west", "name": "Geo Color (ABI, GOES-West)", "group": "GOES", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "GOES-West_ABI_GeoColor", "tms": "GoogleMapsCompatible_Level7", "ext": "jpeg"},
  {"id": "geo-color-abi-goes-east", "name": "Geo Color (ABI, GOES-East)", "group": "GOES", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "GOES-East_ABI_GeoColor", "tms": "GoogleMapsCompatible_Level7", "ext": "jpeg"},
  {"id": "clean-infrared-10-3-m-band-13-10-minute-abi-goes-eas", "name": "Clean Infrared (10.3 µm, Band 13, 10 minute) (ABI, GOES-East)", "group": "GOES", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "GOES-East_ABI_Band13_Clean_Infrared", "tms": "GoogleMapsCompatible_Level6", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/Clean_Longwave_Infrared_Window_Band_H.svg"},
  {"id": "clean-infrared-10-3-m-band-13-10-minute-abi-goes-wes", "name": "Clean Infrared (10.3 µm, Band 13, 10 minute) (ABI, GOES-West)", "group": "GOES", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "GOES-West_ABI_Band13_Clean_Infrared", "tms": "GoogleMapsCompatible_Level6", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/Clean_Longwave_Infrared_Window_Band_H.svg"},
  {"id": "corrected-reflectance-true-color-aqua", "name": "Corrected Reflectance (True Color, Aqua)", "group": "MODIS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "MODIS_Aqua_CorrectedReflectance_TrueColor", "tms": "GoogleMapsCompatible_Level9", "ext": "jpeg"},
  {"id": "corrected-reflectance-true-color-terra", "name": "Corrected Reflectance (True Color, Terra)", "group": "MODIS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "MODIS_Terra_CorrectedReflectance_TrueColor", "tms": "GoogleMapsCompatible_Level9", "ext": "jpeg"},
  {"id": "enhanced-vegetation-index-l3-16-day-aqua", "name": "Enhanced Vegetation Index (L3, 16-Day) (Aqua)", "group": "MODIS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "MODIS_Aqua_L3_EVI_16Day", "tms": "GoogleMapsCompatible_Level9", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/MODIS_L3_EVI_H.svg"},
  {"id": "enhanced-vegetation-index-l3-16-day-terra", "name": "Enhanced Vegetation Index (L3, 16-Day) (Terra)", "group": "MODIS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "MODIS_Terra_L3_EVI_16Day", "tms": "GoogleMapsCompatible_Level9", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/MODIS_L3_EVI_H.svg"},
  {"id": "enhanced-vegetation-index-evi-rolling-8-day-terra", "name": "Enhanced Vegetation Index (EVI rolling 8-day) (Terra)", "group": "MODIS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "MODIS_Terra_EVI_8Day", "tms": "GoogleMapsCompatible_Level9", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/MODIS_EVI_H.svg"},
  {"id": "normalized-difference-vegetation-index-ndvi-rolling-", "name": "Normalized Difference Vegetation Index (NDVI rolling 8-day) (Terra)", "group": "MODIS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "MODIS_Terra_NDVI_8Day", "tms": "GoogleMapsCompatible_Level9", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/MODIS_NDVI_H.svg"},
  {"id": "deep-blue-aerosol-optical-depth-terra", "name": "Deep Blue Aerosol Optical Depth (Terra)", "group": "MODIS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "MODIS_Terra_AOD_Deep_Blue_Land", "tms": "GoogleMapsCompatible_Level6", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/MODIS_VIIRS_AOD_H.svg"},
  {"id": "deep-blue-aerosol-optical-depth-aqua", "name": "Deep Blue Aerosol Optical Depth (Aqua)", "group": "MODIS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "MODIS_Aqua_AOD_Deep_Blue_Land", "tms": "GoogleMapsCompatible_Level6", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/MODIS_VIIRS_AOD_H.svg"},
  {"id": "land-surface-temperature-l3-daily-day-tes-algorithm-", "name": "Land Surface Temperature (L3, Daily, Day, TES Algorithm, Aqua)", "group": "MODIS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "MODIS_Aqua_L3_Land_Surface_Temp_Daily_Day_TES", "tms": "GoogleMapsCompatible_Level7", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/MODIS_Land_Surface_Temp_H.svg"},
  {"id": "land-surface-temperature-l3-daily-night-tes-algorith", "name": "Land Surface Temperature (L3, Daily, Night, TES Algorithm, Aqua)", "group": "MODIS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "MODIS_Aqua_L3_Land_Surface_Temp_Daily_Night_TES", "tms": "GoogleMapsCompatible_Level7", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/MODIS_Land_Surface_Temp_H.svg"},
  {"id": "land-surface-temperature-l3-daily-day-tes-algorithm--2", "name": "Land Surface Temperature (L3, Daily, Day, TES Algorithm, Terra)", "group": "MODIS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "MODIS_Terra_L3_Land_Surface_Temp_Daily_Day_TES", "tms": "GoogleMapsCompatible_Level7", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/MODIS_Land_Surface_Temp_H.svg"},
  {"id": "land-surface-temperature-l3-daily-night-tes-algorith-2", "name": "Land Surface Temperature (L3, Daily, Night, TES Algorithm, Terra)", "group": "MODIS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "MODIS_Terra_L3_Land_Surface_Temp_Daily_Night_TES", "tms": "GoogleMapsCompatible_Level7", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/MODIS_Land_Surface_Temp_H.svg"},
  {"id": "corrected-reflectance-bands-m11-i2-i1-noaa-20-viirs", "name": "Corrected Reflectance (Bands M11-I2-I1) (NOAA-20 / VIIRS)", "group": "VIIRS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "VIIRS_NOAA20_CorrectedReflectance_BandsM11-I2-I1", "tms": "GoogleMapsCompatible_Level9", "ext": "jpeg"},
  {"id": "corrected-reflectance-bands-m11-i2-i1-suomi-npp-viir", "name": "Corrected Reflectance (Bands M11-I2-I1) (Suomi NPP / VIIRS)", "group": "VIIRS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1", "tms": "GoogleMapsCompatible_Level9", "ext": "jpeg"},
  {"id": "enhanced-vegetation-index-evi-rolling-8-day-noaa-20-", "name": "Enhanced Vegetation Index (EVI rolling 8-day) (NOAA-20 / VIIRS)", "group": "VIIRS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "VIIRS_NOAA20_EVI_8Day", "tms": "GoogleMapsCompatible_Level8", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/MODIS_EVI_H.svg"},
  {"id": "enhanced-vegetation-index-evi-rolling-8-day-suomi-np", "name": "Enhanced Vegetation Index (EVI rolling 8-day) (Suomi NPP / VIIRS)", "group": "VIIRS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "VIIRS_SNPP_EVI_8Day", "tms": "GoogleMapsCompatible_Level8", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/MODIS_EVI_H.svg"},
  {"id": "normalized-difference-vegetation-index-ndvi-rolling--2", "name": "Normalized Difference Vegetation Index (NDVI rolling 8-day) (NOAA-20 / VIIRS)", "group": "VIIRS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "VIIRS_NOAA20_NDVI_8Day", "tms": "GoogleMapsCompatible_Level8", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/MODIS_NDVI_H.svg"},
  {"id": "normalized-difference-vegetation-index-ndvi-rolling--2", "name": "Normalized Difference Vegetation Index (NDVI rolling 8-day) (Suomi NPP / VIIRS)", "group": "VIIRS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "VIIRS_SNPP_NDVI_8Day", "tms": "GoogleMapsCompatible_Level8", "ext": "jpeg"},
  {"id": "land-surface-reflectance-bands-i1-i2-i1-noaa-20-viir", "name": "Land Surface Reflectance (Bands I1-I2-I1) (NOAA-20 / VIIRS)", "group": "VIIRS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "VIIRS_NOAA20_SurfaceReflectance_BandsI1-I2-I1", "tms": "GoogleMapsCompatible_Level9", "ext": "jpeg"},
  {"id": "land-surface-reflectance-bands-i1-i2-i1-suomi-npp-vi", "name": "Land Surface Reflectance (Bands I1-I2-I1) (Suomi NPP / VIIRS)", "group": "VIIRS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "VIIRS_SNPP_SurfaceReflectance_BandsI1-I2-I1", "tms": "GoogleMapsCompatible_Level9", "ext": "jpeg"},
  {"id": "land-surface-reflectance-bands-m5-m4-m3-noaa-20-viir", "name": "Land Surface Reflectance (Bands M5-M4-M3) (NOAA-20 / VIIRS)", "group": "VIIRS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "VIIRS_NOAA20_SurfaceReflectance_BandsM5-M4-M3", "tms": "GoogleMapsCompatible_Level8", "ext": "jpeg"},
  {"id": "land-surface-reflectance-bands-m5-m4-m3-suomi-npp-vi", "name": "Land Surface Reflectance (Bands M5-M4-M3) (Suomi NPP / VIIRS)", "group": "VIIRS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "VIIRS_SNPP_SurfaceReflectance_BandsM5-M4-M3", "tms": "GoogleMapsCompatible_Level8", "ext": "jpeg"},
  {"id": "land-surface-reflectance-bands-m11-m7-m5-noaa-20-vii", "name": "Land Surface Reflectance (Bands M11-M7-M5) (NOAA-20 / VIIRS)", "group": "VIIRS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "VIIRS_NOAA20_SurfaceReflectance_BandsM11-M7-M5", "tms": "GoogleMapsCompatible_Level8", "ext": "jpeg"},
  {"id": "land-surface-reflectance-bands-m11-m7-m5-suomi-npp-v", "name": "Land Surface Reflectance (Bands M11-M7-M5) (Suomi NPP / VIIRS)", "group": "VIIRS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%d", "host": "https://gitc.earthdata.nasa.gov", "layer": "VIIRS_SNPP_SurfaceReflectance_BandsM11-M7-M5", "tms": "GoogleMapsCompatible_Level8", "ext": "jpeg"},
  {"id": "dark-target-aerosol-optical-depth-noaa-21", "name": "Dark Target Aerosol Optical Depth (NOAA-21)", "group": "VIIRS", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "VIIRS_NOAA21_AOD_Dark_Target_Land_Ocean", "tms": "GoogleMapsCompatible_Level6", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/MODIS_VIIRS_AOD_H.svg"},
  {"id": "tempo-ozone-column-amount", "name": "TEMPO Ozone Column amount", "group": "TEMPO", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "TEMPO_L3_Ozone_Column_Amount", "tms": "GoogleMapsCompatible_Level7", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/TEMPO_Ozone_Column_H.svg"},
  {"id": "tempo-no2-troposphere", "name": "TEMPO NO2 Troposphere", "group": "TEMPO", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "TEMPO_L3_NO2_Vertical_Column_Troposphere", "tms": "GoogleMapsCompatible_Level7", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/TEMPO_NO2_Vertical_Column_Troposphere_H.svg"},
  {"id": "tempo-formaldehyde", "name": "TEMPO Formaldehyde", "group": "TEMPO", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "TEMPO_L3_Formaldehyde_Vertical_Column", "tms": "GoogleMapsCompatible_Level7", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/TEMPO_HCHO_Vertical_Column_H.svg"},
  {"id": "aerosol-optical-depth-analysis-monthly", "name": "Aerosol Optical Depth Analysis Monthly", "group": "MERRA-2", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "MERRA2_Aerosol_Optical_Depth_Analysis_Monthly", "tms": "GoogleMapsCompatible_Level6", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/MERRA2_Aerosol_Optical_Depth_Analysis_Monthly_H.svg"},
  {"id": "dust-surface-mass-concentration-pm2-5-monthly", "name": "Dust Surface Mass Concentration PM2.5 Monthly", "group": "MERRA-2", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "MERRA2_Dust_Surface_Mass_Concentration_PM25_Monthly", "tms": "GoogleMapsCompatible_Level6", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/MERRA2_Dust_Surface_Mass_Concentration_PM25_Monthly_H.svg"},
  {"id": "soil-water-root-zone-monthly", "name": "Soil Water Root Zone Monthly", "group": "MERRA-2", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "MERRA2_Soil_Water_Root_Zone_Monthly", "tms": "GoogleMapsCompatible_Level6", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/MERRA2_Soil_Water_Root_Zone_Monthly_H.svg"},
  {"id": "total-precipitation-bias-corrected-monthly", "name": "Total Precipitation Bias Corrected Monthly", "group": "MERRA-2", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "MERRA2_Precipitation_Bias_Corrected_Monthly", "tms": "GoogleMapsCompatible_Level6", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/MERRA2_Precipitation_Bias_Corrected_Monthly_H.svg"},
  {"id": "aerosol-optical-depth", "name": "Aerosol Optical Depth", "group": "MAIAC", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth", "tms": "GoogleMapsCompatible_Level7", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/MODIS_VIIRS_AOD_H.svg"},
  {"id": "columnar-water-vapor", "name": "Columnar Water Vapor", "group": "MAIAC", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "MODIS_Combined_MAIAC_L2G_ColumnWaterVapor", "tms": "GoogleMapsCompatible_Level7", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/MODIS_Water_Vapor_H.svg"},
  {"id": "reflectance-nadir-brdf-adjusted-landsat-8-9", "name": "Reflectance Nadir BRDF-Adjusted (Landsat 8&9)", "group": "Landsat 8/9", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "HLS_L30_Nadir_BRDF_Adjusted_Reflectance", "tms": "GoogleMapsCompatible_Level12", "ext": "jpeg"},
  {"id": "30-min-precipitation-rate", "name": "30-min precipitation rate", "group": "IMERG", "kind": "wmts", "time": true, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "IMERG_Precipitation_Rate_30min", "tms": "GoogleMapsCompatible_Level6", "ext": "jpeg", "legend": "https://gibs.earthdata.nasa.gov/legends/GPM_Precipitation_Rate_H.svg"},
  {"id": "aster-digital-elevation-map-color-shaded-relief", "name": "ASTER Digital Elevation Map (Color Shaded Relief)", "group": "Basemaps", "kind": "wmts", "time": false, "gated": false, "timeFormat": "%Y-%m-%dT%H:%M:%SZ", "host": "https://gitc.earthdata.nasa.gov", "layer": "ASTER_GDEM_Color_Shaded_Relief", "tms": "GoogleMapsCompatible_Level12", "ext": "jpeg"},
]

/** Distinct group names, in the order the reference site presents them. */
export const GROUPS = [...new Set(OVERLAYS.map((o) => o.group))]

/** Build a tile URL template for a layer, with {time} already substituted. */
export function overlayUrl(spec, date) {
  if (spec.kind === 'wmts') {
    const t = spec.time ? `${formatTime(spec, date)}/` : ''
    return `${spec.host}/wmts/epsg3857/best/${spec.layer}/default/${t}${spec.tms}/{z}/{y}/{x}.${spec.ext}`
  }
  if (spec.kind === 'wms') return spec.url.replace('{time}', formatTime(spec, date))
  return spec.url.replace('{time}', formatTime(spec, date))
}

/**
 * GIBS wants either a plain date or a full instant, depending on the product,
 * and serves nothing at all for a mismatched one. The catalogue carries the
 * strftime pattern the reference site used, which is the only reliable guide.
 */
function formatTime(spec, date) {
  if (!spec.time) return ''
  const d = String(date).slice(0, 10)
  return spec.timeFormat && spec.timeFormat.includes('%H') ? `${d}T00:00:00Z` : d
}

/** Max native zoom implied by a GIBS tile matrix set name. */
export function tmsMaxZoom(tms) {
  const m = /Level(\d+)/.exec(tms || '')
  return m ? Number(m[1]) : 9
}
