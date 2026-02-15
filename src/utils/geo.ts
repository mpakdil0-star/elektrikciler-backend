
/**
 * Haversine formülü kullanarak iki koordinat arasındaki mesafeyi hesaplar (KM cinsinden)
 */
export const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number => {
    const R = 6371; // Dünyanın yarıçapı (km)
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
};

const toRad = (value: number): number => {
    return (value * Math.PI) / 180;
};

/**
 * Verilen merkez ve yarıçap (km) için Bounding Box (sınırlayıcı kutu) hesaplar.
 * Veritabanı sorgularını hızlandırmak için kullanılır.
 */
export const getBoundingBox = (lat: number, lon: number, radiusKm: number) => {
    const latDelta = radiusKm / 111.32; // 1 derece enlem ~111.32 km
    const lonDelta = radiusKm / (111.32 * Math.cos(toRad(lat)));

    return {
        minLat: lat - latDelta,
        maxLat: lat + latDelta,
        minLon: lon - lonDelta,
        maxLon: lon + lonDelta,
    };
};

/**
 * Türkiye'deki büyük şehirlerin merkez koordinatları (Fallback için)
 */
export const CITY_COORDINATES: Record<string, { lat: number, lng: number }> = {
    'İstanbul': { lat: 41.0082, lng: 28.9784 },
    'Ankara': { lat: 39.9334, lng: 32.8597 },
    'İzmir': { lat: 38.4237, lng: 27.1428 },
    'Adana': { lat: 37.0, lng: 35.3213 },
    'Bursa': { lat: 40.1885, lng: 29.0610 },
    'Antalya': { lat: 36.8841, lng: 30.7056 },
    'Konya': { lat: 37.8714, lng: 32.4846 },
    'Mersin': { lat: 36.8121, lng: 34.6415 },
    'Gaziantep': { lat: 37.0662, lng: 37.3833 },
    'Kayseri': { lat: 38.7205, lng: 35.4826 },
};

export const getCityCoordinates = (cityName: string) => {
    return CITY_COORDINATES[cityName] || CITY_COORDINATES['İstanbul'];
};
