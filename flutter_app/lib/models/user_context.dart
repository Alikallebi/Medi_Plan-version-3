import 'package:json_annotation/json_annotation.dart';
import 'package:equatable/equatable.dart';

part 'user_context.g.dart';

@JsonSerializable()
class UserContext extends Equatable {
  final int userId;
  final String userNom;
  final String userPrenom;
  final String userEmail;
  final String userRole;
  final int? serviceId;
  final String? serviceNom;
  final int? poleId;
  final String? poleNom;
  final int? equipeId;
  final String? equipeNom;
  final List<String> permissions;
  final Map<String, dynamic> metadata;

  const UserContext({
    required this.userId,
    required this.userNom,
    required this.userPrenom,
    required this.userEmail,
    required this.userRole,
    this.serviceId,
    this.serviceNom,
    this.poleId,
    this.poleNom,
    this.equipeId,
    this.equipeNom,
    required this.permissions,
    required this.metadata,
  });

  factory UserContext.fromJson(Map<String, dynamic> json) =>
      _$UserContextFromJson(json);

  Map<String, dynamic> toJson() => _$UserContextToJson(this);

  @override
  List<Object?> get props => [
    userId,
    userNom,
    userPrenom,
    userEmail,
    userRole,
    serviceId,
    serviceNom,
    poleId,
    poleNom,
    equipeId,
    equipeNom,
    permissions,
    metadata,
  ];
}
