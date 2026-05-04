import 'package:json_annotation/json_annotation.dart';
import 'package:equatable/equatable.dart';

part 'competence.g.dart';

enum CompetenceLevel { beginner, intermediate, advanced, expert }

@JsonSerializable()
class Competence extends Equatable {
  final int id;
  final int staffId;
  final String name;
  final String category;
  final CompetenceLevel level;
  final DateTime? acquiredDate;
  final DateTime? expirationDate;
  final String? certificateNumber;
  final bool verified;
  final String? notes;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  const Competence({
    required this.id,
    required this.staffId,
    required this.name,
    required this.category,
    required this.level,
    this.acquiredDate,
    this.expirationDate,
    this.certificateNumber,
    this.verified = false,
    this.notes,
    this.createdAt,
    this.updatedAt,
  });

  factory Competence.fromJson(Map<String, dynamic> json) =>
      _$CompetenceFromJson(json);

  Map<String, dynamic> toJson() => _$CompetenceToJson(this);

  bool get isExpired => expirationDate != null && expirationDate!.isBefore(DateTime.now());
  bool get isExpiringSoon =>
      expirationDate != null &&
      expirationDate!.isAfter(DateTime.now()) &&
      expirationDate!.difference(DateTime.now()).inDays <= 90;

  @override
  List<Object?> get props => [
    id,
    staffId,
    name,
    category,
    level,
    acquiredDate,
    expirationDate,
    certificateNumber,
    verified,
    notes,
    createdAt,
    updatedAt,
  ];
}
