import 'package:json_annotation/json_annotation.dart';
import 'package:equatable/equatable.dart';

part 'affectation.g.dart';

enum AffectationType { primary, secondary, temporary }

@JsonSerializable()
class Affectation extends Equatable {
  final int id;
  final int staffId;
  final int serviceId;
  final String serviceName;
  final int poleId;
  final String poleName;
  final int equipeId;
  final String equipeName;
  final int posteId;
  final String posteName;
  final AffectationType type;
  final DateTime startDate;
  final DateTime? endDate;
  final bool isActive;
  final String? notes;
  final double? allocationPercentage;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  const Affectation({
    required this.id,
    required this.staffId,
    required this.serviceId,
    required this.serviceName,
    required this.poleId,
    required this.poleName,
    required this.equipeId,
    required this.equipeName,
    required this.posteId,
    required this.posteName,
    required this.type,
    required this.startDate,
    this.endDate,
    this.isActive = true,
    this.notes,
    this.allocationPercentage,
    this.createdAt,
    this.updatedAt,
  });

  factory Affectation.fromJson(Map<String, dynamic> json) =>
      _$AffectationFromJson(json);

  Map<String, dynamic> toJson() => _$AffectationToJson(this);

  bool get isExpired => endDate != null && endDate!.isBefore(DateTime.now());
  bool get isUpcoming => startDate.isAfter(DateTime.now());
  bool get isCurrent =>
      !isExpired && !isUpcoming && isActive;

  @override
  List<Object?> get props => [
    id,
    staffId,
    serviceId,
    serviceName,
    poleId,
    poleName,
    equipeId,
    equipeName,
    posteId,
    posteName,
    type,
    startDate,
    endDate,
    isActive,
    notes,
    allocationPercentage,
    createdAt,
    updatedAt,
  ];
}
