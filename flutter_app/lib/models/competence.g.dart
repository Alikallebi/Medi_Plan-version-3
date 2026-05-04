part of 'competence.dart';

CompetenceLevel _$CompetenceLevelFromJson(String value) {
  switch (value) {
    case 'beginner':
      return CompetenceLevel.beginner;
    case 'intermediate':
      return CompetenceLevel.intermediate;
    case 'advanced':
      return CompetenceLevel.advanced;
    case 'expert':
      return CompetenceLevel.expert;
    default:
      throw ArgumentError.value(value, 'value', 'Unsupported CompetenceLevel');
  }
}

String _$CompetenceLevelToJson(CompetenceLevel value) => value.name;

Competence _$CompetenceFromJson(Map<String, dynamic> json) => Competence(
      id: (json['id'] as num).toInt(),
      staffId: (json['staffId'] as num).toInt(),
      name: json['name'] as String,
      category: json['category'] as String,
      level: _$CompetenceLevelFromJson(json['level'] as String),
      acquiredDate: json['acquiredDate'] == null
          ? null
          : DateTime.parse(json['acquiredDate'] as String),
      expirationDate: json['expirationDate'] == null
          ? null
          : DateTime.parse(json['expirationDate'] as String),
      certificateNumber: json['certificateNumber'] as String?,
      verified: json['verified'] as bool? ?? false,
      notes: json['notes'] as String?,
      createdAt: json['createdAt'] == null
          ? null
          : DateTime.parse(json['createdAt'] as String),
      updatedAt: json['updatedAt'] == null
          ? null
          : DateTime.parse(json['updatedAt'] as String),
    );

Map<String, dynamic> _$CompetenceToJson(Competence instance) =>
    <String, dynamic>{
      'id': instance.id,
      'staffId': instance.staffId,
      'name': instance.name,
      'category': instance.category,
      'level': _$CompetenceLevelToJson(instance.level),
      'acquiredDate': instance.acquiredDate?.toIso8601String(),
      'expirationDate': instance.expirationDate?.toIso8601String(),
      'certificateNumber': instance.certificateNumber,
      'verified': instance.verified,
      'notes': instance.notes,
      'createdAt': instance.createdAt?.toIso8601String(),
      'updatedAt': instance.updatedAt?.toIso8601String(),
    };
