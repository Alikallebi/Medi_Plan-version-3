part of 'dashboard_stats.dart';

DashboardStats _$DashboardStatsFromJson(Map<String, dynamic> json) =>
    DashboardStats(
      totalPlannings: (json['totalPlannings'] as num).toInt(),
      approvedPlannings: (json['approvedPlannings'] as num).toInt(),
      pendingPlannings: (json['pendingPlannings'] as num).toInt(),
      rejectedPlannings: (json['rejectedPlannings'] as num).toInt(),
      activeAffectations: (json['activeAffectations'] as num).toInt(),
      expiredCompetences: (json['expiredCompetences'] as num).toInt(),
      expiringCompetences: (json['expiringCompetences'] as num).toInt(),
      nextShiftDate: json['nextShiftDate'] as String,
      nextShiftTime: json['nextShiftTime'] as String?,
      hoursThisWeek: (json['hoursThisWeek'] as num).toDouble(),
      hoursThisMonth: (json['hoursThisMonth'] as num).toDouble(),
    );

Map<String, dynamic> _$DashboardStatsToJson(DashboardStats instance) =>
    <String, dynamic>{
      'totalPlannings': instance.totalPlannings,
      'approvedPlannings': instance.approvedPlannings,
      'pendingPlannings': instance.pendingPlannings,
      'rejectedPlannings': instance.rejectedPlannings,
      'activeAffectations': instance.activeAffectations,
      'expiredCompetences': instance.expiredCompetences,
      'expiringCompetences': instance.expiringCompetences,
      'nextShiftDate': instance.nextShiftDate,
      'nextShiftTime': instance.nextShiftTime,
      'hoursThisWeek': instance.hoursThisWeek,
      'hoursThisMonth': instance.hoursThisMonth,
    };
