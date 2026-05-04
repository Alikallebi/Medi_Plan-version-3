import 'package:json_annotation/json_annotation.dart';
import 'package:equatable/equatable.dart';

part 'history_item.g.dart';

enum HistoryAction {
  created,
  updated,
  submitted,
  approved,
  rejected,
  deleted,
  commented
}

@JsonSerializable()
class HistoryItem extends Equatable {
  final int id;
  final int staffId;
  final HistoryAction action;
  final String entityType;
  final int? entityId;
  final String? description;
  final Map<String, dynamic>? changes;
  final String? changedBy;
  final DateTime createdAt;

  const HistoryItem({
    required this.id,
    required this.staffId,
    required this.action,
    required this.entityType,
    this.entityId,
    this.description,
    this.changes,
    this.changedBy,
    required this.createdAt,
  });

  factory HistoryItem.fromJson(Map<String, dynamic> json) =>
      _$HistoryItemFromJson(json);

  Map<String, dynamic> toJson() => _$HistoryItemToJson(this);

  @override
  List<Object?> get props => [
    id,
    staffId,
    action,
    entityType,
    entityId,
    description,
    changes,
    changedBy,
    createdAt,
  ];
}
