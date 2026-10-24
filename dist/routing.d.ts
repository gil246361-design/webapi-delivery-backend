export declare const SHOP: {
    lat: number;
    lng: number;
};
export declare const RULES: {
    maxOrdersPerRider: number;
    pricePerBox: number;
    costPerBox: number;
    riderFeePerTrip: number;
    feePerKmPerBox: number;
    speedKmh: number;
    deadlineMin: number;
    customerRadiusKm: number;
};
export interface Item {
    order_id: number;
    customer: string;
    phone: string;
    boxes: number;
    lat: number;
    lng: number;
}
export interface PlanStop extends Item {
    sequence: number;
    arrive_min: number;
    late: boolean;
}
export interface RiderRoute {
    rider: string;
    job_code: string;
    total_boxes: number;
    total_distance_km: number;
    total_time_min: number;
    cost: number;
    stops: PlanStop[];
}
export interface RoutePlan {
    plan_no: number;
    candidates: number;
    total_orders: number;
    total_boxes: number;
    revenue: number;
    food_cost: number;
    rider_cost: number;
    profit: number;
    total_distance_km: number;
    total_time_min: number;
    late_count: number;
    all_on_time: boolean;
    routes: RiderRoute[];
}
export declare function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number;
export declare function buildPlan(items: Item[], attempt: number): Promise<RoutePlan>;
//# sourceMappingURL=routing.d.ts.map