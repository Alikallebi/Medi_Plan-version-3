part of 'history_item.dart';

HistoryAction _$HistoryActionFromJson(String value) {
  switch (value) {
    case 'created':
      return HistoryAction.created;
    case 'updated':
      return HistoryAction.updated;
    case 'submitted':
      return HistoryAction.submitted;
    case 'approved':
      return HistoryAction.approved;
    case 'rejected':
      return HistoryAction.rejected;
    case 'deleted':
      return HistoryAction.deleted;
    case 'commented':
      return HistoryAction.commented;
    default:
      throw ArgumentError.value(value, 'value', 'Unsupported HistoryAction');
  }
}

String _$HistoryActionToJson(HistoryAction value) => value.name;

HistoryItem _$HistoryItemFromJson(Map<String, dynamic> json) => HistoryItem(
      id: (json['id'] as num).toInt(),
      staffId: (json['staffId'] as num).toInt(),
      action: _$HistoryActionFromJson(json['action'] as String),
      entityType: json['entityType'] as String,
      entityId: (json['entityId'] as num?)?.toInt(),
      description: json['description'] as String?,
      changes: (json['changes'] as Map?)?.cast<String, dynamic>(),
      changedBy: json['changedBy'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$HistoryItemToJson(HistoryItem instance) =>
    <String, dynamic>{
      'id': instance.id,
      'staffId': instance.staffId,
      'action': _$HistoryActionToJson(instance.action),
      'entityType': instance.entityType,
      'entityId': instance.entityId,
      'description': instance.description,
      'changes': instance.changes,
      'changedBy': instance.changedBy,
      'createdAt': instance.createdAt.toIso8601String(),
    };
