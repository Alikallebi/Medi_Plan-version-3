import 'package:json_annotation/json_annotation.dart';
import 'package:equatable/equatable.dart';

part 'dashboard_stats.g.dart';

@JsonSerializable()
class DashboardStats extends Equatable {
  final int totalPlannings;
  final int approvedPlannings;
  final int pendingPlannings;
  final int rejectedPlannings;
  final int activeAffectations;
  final int expiredCompetences;
  final int expiringCompetences;
  final String nextShiftDate;
  final String? nextShiftTime;
  final double hoursThisWeek;
  final double hoursThisMonth;

  const DashboardStats({
    required this.totalPlannings,
    required this.approvedPlannings,
    required this.pendingPlannings,
    required this.rejectedPlannings,
    required this.activeAffectations,
    required this.expiredCompetences,
    required this.expiringCompetences,
    required this.nextShiftDate,
    this.nextShiftTime,
    required this.hoursThisWeek,
    required this.hoursThisMonth,
  });

  factory DashboardStats.fromJson(Map<String, dynamic> json) =>
      _$DashboardStatsFromJson(json);

  Map<String, dynamic> toJson() => _$DashboardStatsToJson(this);

  @override
  List<Object?> get props => [
    totalPlannings,
    approvedPlannings,
    pendingPlannings,
    rejectedPlannings,
    activeAffectations,
    expiredCompetences,
    expiringCompetences,
    nextShiftDate,
    nextShiftTime,
    hoursThisWeek,
    hoursThisMonth,
  ];
}
